import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { HaEntityState } from '@hame/shared'
import { SetpointRow } from './heating-widget'

/** A thermostat as Home Assistant publishes one: 19.5° in the room, 20° asked for. */
function climate(over: Partial<HaEntityState> = {}): HaEntityState {
  return {
    entityId: 'climate.hallway',
    domain: 'climate',
    state: 'heat',
    friendlyName: 'Hallway',
    attributes: {
      current_temperature: 19.5,
      temperature: 20,
      min_temp: 7,
      max_temp: 24,
      target_temp_step: 0.5,
    },
    lastChanged: null,
    ...over,
  }
}

function renderRow(entity = climate()) {
  const onCall = vi.fn()
  const view = render(<SetpointRow entity={entity} busy={false} onCall={onCall} />)
  return {
    onCall,
    rerender: (next: HaEntityState) =>
      view.rerender(<SetpointRow entity={next} busy={false} onCall={onCall} />),
  }
}

const raise = () => fireEvent.click(screen.getByRole('button', { name: /raise/i }))
const lower = () => fireEvent.click(screen.getByRole('button', { name: /lower/i }))

/** Let the debounce fire. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(1000)
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('SetpointRow', () => {
  it('shows the target it was given, and the room temperature beside it', () => {
    renderRow()
    expect(screen.getByText('20°')).toBeInTheDocument()
    expect(screen.getByText('19.5°')).toBeInTheDocument()
  })

  it('moves the number on the tap, before Home Assistant has said anything', () => {
    const { onCall } = renderRow()
    raise()
    expect(screen.getByText('20.5°')).toBeInTheDocument()
    expect(onCall).not.toHaveBeenCalled() // still waiting for further taps
  })

  it('sends the settled value once, not every step along the way', () => {
    const { onCall } = renderRow()
    raise()
    raise()
    raise()
    expect(screen.getByText('21.5°')).toBeInTheDocument()
    settle()
    expect(onCall).toHaveBeenCalledTimes(1)
    expect(onCall).toHaveBeenCalledWith('set_temperature', { temperature: 21.5 })
  })

  it('steps down as well', () => {
    const { onCall } = renderRow()
    lower()
    settle()
    expect(onCall).toHaveBeenCalledWith('set_temperature', { temperature: 19.5 })
  })

  it('gives up the local value once HA reports it', () => {
    const { rerender } = renderRow()
    raise()
    settle()
    expect(screen.getByText('20.5°')).toBeInTheDocument()

    // HA catches up, then someone changes it at the thermostat itself.
    rerender(climate({ attributes: { ...climate().attributes, temperature: 20.5 } }))
    rerender(climate({ attributes: { ...climate().attributes, temperature: 18 } }))
    expect(screen.getByText('18°')).toBeInTheDocument()
  })

  it('snaps back to HA’s truth when a change is never confirmed', () => {
    renderRow()
    raise()
    expect(screen.getByText('20.5°')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(9000) // past the confirmation timeout
    })
    expect(screen.getByText('20°')).toBeInTheDocument()
  })

  it('stops at the device’s own limits rather than the envelope’s', () => {
    const attributes = { ...climate().attributes, temperature: 24 }
    renderRow(climate({ attributes }))
    expect(screen.getByRole('button', { name: /raise/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /lower/i })).not.toBeDisabled()
  })

  it('turns the heating off when it is on', () => {
    const { onCall } = renderRow()
    fireEvent.click(screen.getByRole('switch'))
    expect(onCall).toHaveBeenCalledWith('set_hvac_mode', { hvac_mode: 'off' })
  })

  it('turns it back on to heat when it is off', () => {
    const { onCall } = renderRow(climate({ state: 'off' }))
    fireEvent.click(screen.getByRole('switch'))
    expect(onCall).toHaveBeenCalledWith('set_hvac_mode', { hvac_mode: 'heat' })
  })

  it('reads a thermostat that publishes no target at all', () => {
    const attributes = { ...climate().attributes, temperature: null }
    renderRow(climate({ attributes }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
