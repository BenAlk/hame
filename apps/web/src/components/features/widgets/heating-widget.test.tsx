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

/** The same thermostat with some attributes replaced. */
function withAttrs(over: Record<string, unknown>): HaEntityState {
  return climate({ attributes: { ...climate().attributes, ...over } })
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

const raiseButton = () => screen.getByRole('button', { name: /raise/i })
const lowerButton = () => screen.getByRole('button', { name: /lower/i })
const raise = () => fireEvent.click(raiseButton())
const lower = () => fireEvent.click(lowerButton())

/** Let the debounce fire. */
function settle() {
  act(() => {
    vi.advanceTimersByTime(1000)
  })
}

/** The filled portion of the dial, as a fraction of the whole arc. */
function fillFraction(): number {
  const fill = document.querySelector('path[stroke-dasharray]')
  const [drawn, total] = (fill?.getAttribute('stroke-dasharray') ?? '0 1').split(' ').map(Number)
  return drawn / total
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('SetpointRow', () => {
  it('shows the target it was given, and the room temperature beneath it', () => {
    renderRow()
    expect(screen.getByText('20°')).toBeInTheDocument()
    expect(screen.getByText('Now 19.5°')).toBeInTheDocument()
  })

  it('names the device’s own range at the foot of the dial', () => {
    renderRow()
    expect(screen.getByText('7°')).toBeInTheDocument()
    expect(screen.getByText('24°')).toBeInTheDocument()
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
    rerender(withAttrs({ temperature: 20.5 }))
    rerender(withAttrs({ temperature: 18 }))
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
    renderRow(withAttrs({ temperature: 24 }))
    expect(raiseButton()).toBeDisabled()
    expect(lowerButton()).not.toBeDisabled()
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
    renderRow(withAttrs({ temperature: null }))
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})

describe('SetpointRow — the dial', () => {
  it('fills the arc to where the target sits in the device’s range', () => {
    renderRow(withAttrs({ temperature: 15.5, min_temp: 7, max_temp: 24 }))
    expect(fillFraction()).toBeCloseTo(0.5, 2) // halfway up a 7–24 range
  })

  it('follows the target as it moves, before HA confirms', () => {
    renderRow(withAttrs({ temperature: 15.5 }))
    const before = fillFraction()
    raise()
    expect(fillFraction()).toBeGreaterThan(before)
  })

  it('draws no fill for a thermostat with no target', () => {
    renderRow(withAttrs({ temperature: null }))
    expect(document.querySelector('path[stroke-dasharray]')).toBeNull()
  })

  it('leaves the room-temperature marker off when there is no reading', () => {
    renderRow(withAttrs({ current_temperature: null }))
    expect(document.querySelector('circle')).toBeNull()
    expect(screen.queryByText(/^Now/)).not.toBeInTheDocument()
  })
})

describe('SetpointRow — what it says it is doing', () => {
  it('believes the thermostat’s own answer over the temperatures', () => {
    renderRow(withAttrs({ hvac_action: 'idle', temperature: 22 }))
    expect(screen.getByText('At temperature')).toBeInTheDocument()
  })

  it('falls back to the temperatures when the thermostat publishes none', () => {
    renderRow(withAttrs({ temperature: 22 }))
    expect(screen.getByText('Heating')).toBeInTheDocument()
  })

  it('says nothing about heating while it is off', () => {
    renderRow(climate({ state: 'off' }))
    expect(screen.getByText('Off')).toBeInTheDocument()
  })
})

describe('SetpointRow — holding a stepper', () => {
  /** Press, hold for `ms`, release. */
  function hold(button: HTMLElement, ms: number) {
    fireEvent.pointerDown(button)
    act(() => {
      vi.advanceTimersByTime(ms)
    })
    fireEvent.pointerUp(button)
  }

  it('moves once on a press, without waiting for the repeat', () => {
    renderRow()
    fireEvent.pointerDown(raiseButton())
    expect(screen.getByText('20.5°')).toBeInTheDocument()
    fireEvent.pointerUp(raiseButton())
  })

  it('does not double-count the click that follows a press', () => {
    renderRow()
    fireEvent.pointerDown(raiseButton())
    fireEvent.pointerUp(raiseButton())
    fireEvent.click(raiseButton())
    expect(screen.getByText('20.5°')).toBeInTheDocument()
  })

  it('keeps climbing while it is held', () => {
    renderRow()
    hold(raiseButton(), 900) // 400ms before it starts, then every 110ms
    expect(screen.getByText('22.5°')).toBeInTheDocument()
  })

  it('stops the moment it is released', () => {
    renderRow()
    hold(raiseButton(), 900)
    const reached = screen.getByText('22.5°')
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(reached).toBeInTheDocument()
  })

  it('stops when the pointer leaves the button mid-hold', () => {
    renderRow()
    fireEvent.pointerDown(raiseButton())
    act(() => {
      vi.advanceTimersByTime(600) // the press, then one repeat at 510ms
    })
    fireEvent.pointerLeave(raiseButton())
    expect(screen.getByText('21°')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByText('21°')).toBeInTheDocument() // and no further
  })

  it('sends one setpoint for a whole hold, not one per step', () => {
    const { onCall } = renderRow()
    hold(raiseButton(), 900)
    settle()
    expect(onCall).toHaveBeenCalledTimes(1)
    expect(onCall).toHaveBeenCalledWith('set_temperature', { temperature: 22.5 })
  })

  it('a hold that reaches the device’s limit stops there', () => {
    renderRow(withAttrs({ temperature: 23 }))
    hold(raiseButton(), 5000)
    // The dial's max marker also reads 24°, so ask the announcement instead.
    expect(screen.getByText('Target 24 degrees')).toBeInTheDocument()
    expect(raiseButton()).toBeDisabled()
  })
})
