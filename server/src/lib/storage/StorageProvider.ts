export interface UploadResult {
  url: string;
  key: string;
}

export interface StorageProvider {
  /**
   * Upload a file buffer and return its public URL and storage key.
   */
  upload(key: string, buffer: Buffer, mimeType: string): Promise<UploadResult>;

  /**
   * Delete a stored file by its key.
   */
  delete(key: string): Promise<void>;

  /**
   * Return a public URL for a stored key.
   */
  publicUrl(key: string): string;
}
