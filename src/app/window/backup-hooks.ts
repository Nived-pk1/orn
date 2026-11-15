/** React's view of the backup record (step 8.4s, S4). Without an app context value there are no marks. */
import { useSyncExternalStore } from 'react';
import { useAppOptional } from './context';
import { NO_BACKUP_RECORD, type BackupMarks, type BackupRecord } from './backup-record';

export const useBackupRecord = (): BackupRecord => useAppOptional()?.backup ?? NO_BACKUP_RECORD;

export function useBackupMarks(): BackupMarks {
  const record = useBackupRecord();
  return useSyncExternalStore(record.subscribe, record.get);
}
