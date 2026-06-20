import { useState } from 'react'
import { Download } from 'lucide-react'
import type { ImportedRecipeDraft } from '@hame/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/api/client'
import { useImportRecipe } from '@/api/recipes'

/** Paste a recipe URL → parse its schema.org data into an editable draft (§8.5). */
export function UrlImport({ onImported }: { onImported: (draft: ImportedRecipeDraft) => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const importRecipe = useImportRecipe()

  async function handleImport() {
    setError(null)
    if (!url.trim()) return setError('Paste a recipe URL first.')
    try {
      onImported(await importRecipe.mutateAsync({ url: url.trim() }))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not import that recipe.')
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-accent-soft/40 p-4">
      <Label htmlFor="import-url">Import from a website</Label>
      <div className="flex gap-2">
        <Input
          id="import-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="flex-1"
        />
        <Button type="button" onClick={() => void handleImport()} disabled={importRecipe.isPending}>
          <Download className="size-4" />
          {importRecipe.isPending ? 'Importing…' : 'Import'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pulls the title, ingredients and method from the page&apos;s recipe data. Review before
        saving.
      </p>
      {error && <p className="text-sm text-warning">{error}</p>}
    </div>
  )
}
