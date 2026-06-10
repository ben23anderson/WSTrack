import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider, UploadResult } from './StorageProvider.js';

export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly uploadDir: string,
    private readonly baseUrl: string
  ) {}

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<UploadResult> {
    const fullPath = path.join(this.uploadDir, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return { url: this.publicUrl(key), key };
  }

  async delete(key: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, key);
    await fs.unlink(fullPath).catch(() => undefined);
  }

  publicUrl(key: string): string {
    return `${this.baseUrl}/uploads/${key}`;
  }
}
