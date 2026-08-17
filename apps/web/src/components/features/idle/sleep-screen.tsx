/**
 * The sleep-mode display (spec §8.14a) — a plain black screen, nothing else.
 * Window-level activity listeners already owned by `useIdleMode()` wake it,
 * so this component has no behaviour of its own.
 */
export function SleepScreen() {
  return <div className="fixed inset-0 z-[60] bg-black" />
}
