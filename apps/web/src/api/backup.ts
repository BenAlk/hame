import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BackupEnvelope, ImportBackupResult } from '@hame/shared'
import { apiFetch } from './client'

/**
 * Backup export/import (spec §8.15). Export returns the encrypted envelope (the
 * caller saves it to a file); import replaces all data, so on success we drop the
 * entire query cache — every screen now reflects the restored database.
 */

export function useExportBackup() {
  return useMutation({
    mutationFn: (passphrase: string) =>
      apiFetch<BackupEnvelope>('/api/backup/export', {
        method: 'POST',
        body: JSON.stringify({ passphrase }),
      }),
  })
}

export function useImportBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { passphrase: string; envelope: BackupEnvelope }) =>
      apiFetch<ImportBackupResult>('/api/backup/import', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries()
    },
  })
}
