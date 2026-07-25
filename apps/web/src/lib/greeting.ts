import type { PublicUser } from '@hame/shared'

/** The time-of-day greeting shown on the dashboard (spec §8.12). */
export function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * The full greeting line, addressed to whoever is signed in.
 *
 * The wall tablet is furniture rather than a person, so it starts unnamed and is
 * greeted without one — "Good evening." rather than the account's placeholder
 * (spec §8.1). Give it a name under Settings → Users and it's greeted by that,
 * exactly like a member. Note this follows the *signed-in* account, not the
 * dashboard being viewed: paging the tablet through someone's board doesn't
 * start greeting them.
 */
export function greetingLine(
  user: Pick<PublicUser, 'firstName'> | null,
  date = new Date(),
): string {
  const name = user?.firstName.trim()
  return name ? `${greeting(date)}, ${name}.` : `${greeting(date)}.`
}
