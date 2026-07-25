import { describe, it, expect } from 'vitest'
import { greeting, greetingLine } from './greeting'

const at = (hour: number) => new Date(2026, 6, 25, hour, 0, 0)

describe('greeting', () => {
  it('picks the phrase from the time of day', () => {
    expect(greeting(at(0))).toBe('Good morning')
    expect(greeting(at(11))).toBe('Good morning')
    expect(greeting(at(12))).toBe('Good afternoon')
    expect(greeting(at(17))).toBe('Good afternoon')
    expect(greeting(at(18))).toBe('Good evening')
    expect(greeting(at(23))).toBe('Good evening')
  })
})

describe('greetingLine', () => {
  it('addresses a named account', () => {
    expect(greetingLine({ firstName: 'Alex' }, at(9))).toBe('Good morning, Alex.')
  })

  // The wall tablet is furniture, not a person, so it starts unnamed (spec §8.1)
  // — greeting it by its placeholder profile read as "Good evening, Wall."
  it('omits the name for an unnamed account (the wall tablet)', () => {
    expect(greetingLine({ firstName: '' }, at(19))).toBe('Good evening.')
    expect(greetingLine({ firstName: '   ' }, at(19))).toBe('Good evening.')
  })

  it('uses a name the tablet has been given', () => {
    expect(greetingLine({ firstName: 'Kitchen' }, at(13))).toBe('Good afternoon, Kitchen.')
  })

  it('omits the name before the signed-in user has loaded', () => {
    expect(greetingLine(null, at(9))).toBe('Good morning.')
  })
})
