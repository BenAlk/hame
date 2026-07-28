import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Tag } from '@hame/shared'
import { ItemTagsEditor } from './item-tags-editor'

// Hoisted so the mock factories below (which are hoisted too) can reach them.
const mocks = vi.hoisted(() => ({
  dairy: { id: 't1', name: 'dairy', colour: null },
  chilled: { id: 't2', name: 'chilled', colour: null },
  suggest: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/api/tags', () => ({
  useTags: () => ({ data: [mocks.dairy, mocks.chilled] }),
  useCreateTag: () => ({ mutateAsync: mocks.create, isPending: false }),
}))

vi.mock('@/api/items', () => ({
  useSuggestTags: () => ({ mutateAsync: mocks.suggest, isPending: false }),
}))

const dairy = mocks.dairy as Tag

/** Click something that kicks off a mutation, and let its state settle. */
async function clickAndSettle(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

function renderEditor(over: { value?: Tag[]; itemName?: string } = {}) {
  const onChange = vi.fn()
  render(
    <ItemTagsEditor
      inputId="tags"
      itemName={over.itemName ?? 'Cheddar'}
      value={over.value ?? []}
      onChange={onChange}
    />,
  )
  return { onChange }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ItemTagsEditor', () => {
  /**
   * The load-bearing claim: nothing the model says changes an item on its own.
   * A suggestion arrives as a chip and takes a deliberate tap to accept.
   */
  it('offers suggestions without applying them', async () => {
    mocks.suggest.mockResolvedValue({ tags: [mocks.dairy], source: 'LLM' })
    const { onChange } = renderEditor()

    await clickAndSettle(/suggest tags/i)
    const chip = screen.getByRole('button', { name: /dairy/ })

    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith([dairy])
  })

  it('sends someone to settings when no model is configured', async () => {
    mocks.suggest.mockResolvedValue({ tags: [], source: 'UNAVAILABLE' })
    renderEditor()

    await clickAndSettle(/suggest tags/i)
    expect(screen.getByText(/No language model configured/)).toBeInTheDocument()
  })

  it('cannot ask for suggestions with no name to reason from', () => {
    renderEditor({ itemName: '   ' })
    expect(screen.getByRole('button', { name: /suggest tags/i })).toBeDisabled()
  })

  it('offers to create a tag the pool does not have, and applies it once made', async () => {
    const bakery = { id: 't3', name: 'bakery', colour: null }
    mocks.create.mockResolvedValue(bakery)
    const { onChange } = renderEditor()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bakery' } })
    await clickAndSettle(/Create/)

    expect(mocks.create).toHaveBeenCalledWith({ name: 'bakery' })
    expect(onChange).toHaveBeenCalledWith([bakery])
  })

  /** The whole point of the enum-constrained pool — no near-duplicate tags. */
  it('offers the existing tag rather than creating a case variant', () => {
    renderEditor()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Dairy' } })

    expect(screen.queryByRole('button', { name: /Create/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'dairy' })).toBeInTheDocument()
  })

  it('removes an applied tag', () => {
    const { onChange } = renderEditor({ value: [dairy] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag dairy' }))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
