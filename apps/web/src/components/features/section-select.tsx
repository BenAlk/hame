import { useSections } from '@/api/sections'

/**
 * Pick which part of the shop an item is in (spec §8.3). Single-choice, because
 * an item is in exactly one section — the reason this is a field and not a tag.
 *
 * Options list in walking order rather than alphabetically, so the picker reads
 * the same way the shopping list will.
 */
export function SectionSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: string | null
  onChange: (sectionId: string | null) => void
  disabled?: boolean
}) {
  const { data: sections } = useSections()

  return (
    <select
      id={id}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-10 w-full rounded-control border border-input bg-surface px-2 text-sm text-ink"
    >
      <option value="">No section — groups under “Other”</option>
      {sections?.map((section) => (
        <option key={section.id} value={section.id}>
          {section.name}
        </option>
      ))}
    </select>
  )
}
