import { describe, expect, it } from 'vitest';
import {
  buildUniqueStoragePath,
  sanitizeStorageFileName,
  SIGNED_URL_EXPIRY_SECONDS,
  validateUploadFileSize,
} from './storage';

describe('Storage path and upload validation helpers', () => {
  it('constructs unique {project_id}/{uuid}/{file_name} paths and sanitizes slashes', () => {
    const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const uuid = '10000000-0000-4000-8000-000000000001';
    const path = buildUniqueStoragePath(projectId, 'gerbers/top\\layer.gbr', uuid);

    expect(path).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/10000000-0000-4000-8000-000000000001/gerbers_top_layer.gbr',
    );
    expect(sanitizeStorageFileName('   ')).toBe('artifact.bin');
  });

  it('enforces max upload size and 60-second signed URL expiry', () => {
    const fiftyMb = 50 * 1024 * 1024;
    expect(validateUploadFileSize(fiftyMb, fiftyMb)).toBe(true);
    expect(validateUploadFileSize(fiftyMb + 1, fiftyMb)).toBe(false);
    expect(SIGNED_URL_EXPIRY_SECONDS).toBe(60);
  });
});
