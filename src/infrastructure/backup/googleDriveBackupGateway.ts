import { Capacitor } from '@capacitor/core'

import type { CloudBackupGateway, CloudBackupInfo } from '@/domain/ports'
import {
  getGoogleContactsGateway,
  nativeGooglePlugin,
  type GoogleDriveFile,
} from '@/infrastructure/contacts/googleContactsGateway'

const BACKUP_FILE_NAME = 'kindy-backup.json'

export class NotConnectedError extends Error {
  constructor() {
    super('Google is not connected')
  }
}

function info(file: GoogleDriveFile): CloudBackupInfo {
  return {
    id: file.id,
    modifiedAt: file.modifiedTime ? Date.parse(file.modifiedTime) : Date.now(),
    sizeBytes: Number(file.size ?? 0),
  }
}

/**
 * Stores one backup file in the hidden app folder of the user's Google Drive.
 * Only Kindy can see that folder; it does not appear among the user's files.
 */
class NativeGoogleDriveBackupGateway implements CloudBackupGateway {
  private async connect(): Promise<void> {
    if (!(await getGoogleContactsGateway().restore())) throw new NotConnectedError()
  }

  async latest(): Promise<CloudBackupInfo | null> {
    await this.connect()
    const { file } = await nativeGooglePlugin.findBackup({ name: BACKUP_FILE_NAME })
    return file ? info(file) : null
  }

  async upload(content: string): Promise<CloudBackupInfo> {
    await this.connect()
    const { file } = await nativeGooglePlugin.findBackup({ name: BACKUP_FILE_NAME })
    return info(
      await nativeGooglePlugin.uploadBackup({ name: BACKUP_FILE_NAME, fileId: file?.id, content }),
    )
  }

  async download(id: string): Promise<string> {
    await this.connect()
    return (await nativeGooglePlugin.downloadBackup({ fileId: id })).content
  }
}

const PREVIEW_DRIVE_KEY = 'kindy.preview-drive-backup'

/** Browser stand-in that keeps the "Drive" backup in local storage. */
class PreviewDriveBackupGateway implements CloudBackupGateway {
  async latest(): Promise<CloudBackupInfo | null> {
    const stored = this.read()
    return stored
      ? { id: 'preview-backup', modifiedAt: stored.modifiedAt, sizeBytes: stored.content.length }
      : null
  }

  async upload(content: string): Promise<CloudBackupInfo> {
    await new Promise((resolve) => setTimeout(resolve, 500))
    const modifiedAt = Date.now()
    try {
      localStorage.setItem(PREVIEW_DRIVE_KEY, JSON.stringify({ modifiedAt, content }))
    } catch {
      throw new Error('The preview backup does not fit in browser storage')
    }
    return { id: 'preview-backup', modifiedAt, sizeBytes: content.length }
  }

  async download(): Promise<string> {
    const stored = this.read()
    if (!stored) throw new Error('No preview backup')
    return stored.content
  }

  private read(): { modifiedAt: number; content: string } | null {
    try {
      const raw = localStorage.getItem(PREVIEW_DRIVE_KEY)
      return raw ? (JSON.parse(raw) as { modifiedAt: number; content: string }) : null
    } catch {
      return null
    }
  }
}

let gateway: CloudBackupGateway | undefined

export function getCloudBackupGateway(): CloudBackupGateway {
  gateway ??= Capacitor.isNativePlatform()
    ? new NativeGoogleDriveBackupGateway()
    : new PreviewDriveBackupGateway()
  return gateway
}
