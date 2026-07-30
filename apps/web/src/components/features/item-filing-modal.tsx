import type { Item } from '@hame/shared'
import { Modal } from '@/components/ui/modal'
import { Label } from '@/components/ui/label'
import { ItemTagsEditor } from '@/components/features/item-tags-editor'
import { SectionSelect } from '@/components/features/section-select'
import { ApiError } from '@/api/client'
import { useUpdateItem } from '@/api/items'

/**
 * Where an item belongs — its shop section and its tags — in a modal, for
 * surfaces that show an item but have no detail view of their own, notably a
 * shopping line. Both are facts about the *product*, so editing them from a list
 * row never touches the list.
 *
 * Saves on each change rather than behind a Save button, matching how the shop is
 * set from the pantry: each edit is one small, reversible fact, and there is
 * nothing here to submit as a set.
 */
export function ItemFilingModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const updateItem = useUpdateItem()

  return (
    <Modal open={item !== null} onClose={onClose} title={item?.name ?? ''}>
      {item && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filing-section">Section</Label>
            <SectionSelect
              id="filing-section"
              itemName={item.name}
              value={item.section?.id ?? null}
              disabled={updateItem.isPending}
              onChange={(sectionId) => void updateItem.mutateAsync({ id: item.id, sectionId })}
            />
            <p className="text-xs text-muted-foreground">
              Groups this line while you shop, in the order you walk round.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filing-tags">Tags</Label>
            <ItemTagsEditor
              inputId="filing-tags"
              itemName={item.name}
              value={item.tags}
              disabled={updateItem.isPending}
              onChange={(next) =>
                void updateItem.mutateAsync({ id: item.id, tagIds: next.map((tag) => tag.id) })
              }
            />
          </div>

          {updateItem.isError && (
            <p className="text-sm text-warning">
              {updateItem.error instanceof ApiError
                ? updateItem.error.message
                : 'Could not save that.'}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
