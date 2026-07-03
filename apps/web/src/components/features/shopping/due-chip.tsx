/** Small amber "Due" pill for a consumable likely needing a re-order (spec §8.3, §12). */
export function DueChip() {
  return (
    <span
      title="Likely due for a re-order"
      className="inline-flex shrink-0 items-center rounded-pill border border-warning px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning"
    >
      Due
    </span>
  )
}
