import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BackupEnvelope,
  BackupSettings,
  ImportBackupResult,
  RunBackupResult,
  UpdateBackupSettingsInput,
} from '@hame/shared'
import { apiFetch } from './client'

const BACKUP_SETTINGS_KEY = ['backup-settings'] as const

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

/** Admin-only: the automated on-disk backup schedule (spec §10 Phase 8.9). */
export function useBackupSettings() {
  return useQuery<BackupSettings>({
    queryKey: BACKUP_SETTINGS_KEY,
    queryFn: () => apiFetch<BackupSettings>('/api/backup/settings'),
  })
}

/** Admin-only: save the automated-backup schedule (and optionally its passphrase). */
export function useUpdateBackupSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateBackupSettingsInput) =>
      apiFetch<BackupSettings>('/api/backup/settings', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(BACKUP_SETTINGS_KEY, data),
  })
}

/** Admin-only: write a backup to disk immediately ("Back up now"). */
export function useRunBackup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<RunBackupResult>('/api/backup/run', { method: 'POST' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: BACKUP_SETTINGS_KEY }),
  })
}
