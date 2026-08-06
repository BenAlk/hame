import { useMemo, useState } from 'react'
import { Check, Pencil, Trash2, X } from 'lucide-react'
import type { Tag, TagKind } from '@hame/shared'
import { TAG_KINDS, TAG_KIND_LABELS } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TagChip } from '@/components/features/tag-chip'
import { ApiError } from '@/api/client'
import { toast } from '@/stores/toast'
import { useDeleteTag, useTags, useUpdateTag } from '@/api/tags'

/**
 * Admin-only tag management (spec §10 Phase 24).
 *
 * Tags are created inline wherever they're used, by anyone; this is where the
 * household's shared vocabulary is *curated*. It exists because Phase 24 gave a
 * tag a `kind` that decides where it's offered and whether the model may suggest
 * it — a fact that can be wrong, and so has to be changeable. It is also the first
 * caller `updateTag` and `deleteTag` have ever had: they shipped in Phase 2 and
 * until now a mistyped tag was permanent.
 *
 * Grouped by kind rather than listed flat, because the kind is the thing being
 * curated — seeing that `dinner` sits under Recipe is the whole point.
 */
export function TagsCard() {
  const { data: tags } = useTags()
  const [editing, setEditing] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null)
  const deleteTag = useDeleteTag()

  const grouped = useMemo(() => {
    const pool = tags ?? []
    return TAG_KINDS.map((kind) => ({ kind, tags: pool.filter((tag) => tag.kind === kind) }))
  }, [tags])

  async function onDelete() {
    if (!pendingDelete) return
    try {
      await deleteTag.mutateAsync(pendingDelete.id)
      toast.success(`Deleted “${pendingDelete.name}”.`)
      setPendingDelete(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete that tag.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
        <CardDescription>
          One pool, shared by items, recipes and chores. A tag&apos;s <strong>kind</strong> decides
          where it&apos;s offered and whether tag suggestions may reach for it — only item tags are
          ever suggested, because a dietary claim can only be read off a packet. Anyone can create a
          tag while tagging something; editing and deleting are yours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {tags && tags.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tags yet — they appear here as they&apos;re created.
          </p>
        )}

        {grouped.map(
          ({ kind, tags: inKind }) =>
            inKind.length > 0 && (
              <section key={kind} className="flex flex-col gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {TAG_KIND_LABELS[kind].label}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {TAG_KIND_LABELS[kind].description}
                  </p>
                </div>
                <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
                  {inKind.map((tag) => (
                    <li key={tag.id} className="p-2.5">
                      {editing === tag.id ? (
                        <TagRowEditor tag={tag} onDone={() => setEditing(null)} />
                      ) : (
                        <div className="flex items-center gap-2">
                          <TagChip tag={tag} className="px-2.5 py-1 text-xs" />
                          <div className="ml-auto flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Edit ${tag.name}`}
                              onClick={() => setEditing(tag.id)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete ${tag.name}`}
                              onClick={() => setPendingDelete(tag)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </CardContent>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete “${pendingDelete?.name ?? ''}”?`}
        confirmLabel="Delete tag"
        pending={deleteTag.isPending}
        onConfirm={() => void onDelete()}
        onCancel={() => setPendingDelete(null)}
      >
        {/* A tag is a shared label: deletion is wide, but nothing else goes with
            it. Worth saying plainly rather than warning vaguely. */}
        It will be removed from every item, recipe and chore carrying it. Nothing else is deleted.
      </ConfirmDialog>
    </Card>
  )
}

/** Inline edit of one tag's name, kind and colour. */
function TagRowEditor({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const updateTag = useUpdateTag()
  const [name, setName] = useState(tag.name)
  const [kind, setKind] = useState<TagKind>(tag.kind)
  const [colour, setColour] = useState(tag.colour ?? '#857a6c')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return setError('A tag needs a name.')
    setError(null)
    try {
      await updateTag.mutateAsync({ id: tag.id, name: trimmed, kind, colour })
      onDone()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that tag.')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          aria-label="Tag name"
          disabled={updateTag.isPending}
          className="w-40"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            void save()
          }}
        />
        <select
          value={kind}
          aria-label="Tag kind"
          disabled={updateTag.isPending}
          onChange={(e) => setKind(e.target.value as TagKind)}
          className="h-10 rounded-control border border-input bg-surface px-2 text-sm text-ink"
        >
          {TAG_KINDS.map((value) => (
            <option key={value} value={value}>
              {TAG_KIND_LABELS[value].label}
            </option>
          ))}
        </select>
        <input
          type="color"
          value={colour}
          aria-label="Tag colour"
          disabled={updateTag.isPending}
          onChange={(e) => setColour(e.target.value)}
          className="h-10 w-12 rounded-control border border-input bg-surface p-1"
        />
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Cancel"
            disabled={updateTag.isPending}
            onClick={onDone}
          >
            <X className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            aria-label="Save tag"
            disabled={updateTag.isPending}
            onClick={() => void save()}
          >
            <Check className="size-3.5" />
          </Button>
        </div>
      </div>
      {error && <p className="text-xs text-warning">{error}</p>}
    </div>
  )
}
