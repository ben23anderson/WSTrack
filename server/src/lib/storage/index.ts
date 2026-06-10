import { config } from '../../config.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import type { StorageProvider } from './StorageProvider.js';

export function createStorageProvider(): StorageProvider {
  if (config.STORAGE_PROVIDER === 's3') {
    throw new Error('S3 provider not yet implemented');
  }
  return new LocalStorageProvider(config.UPLOAD_DIR, `http://localhost:${config.PORT}`);
}
