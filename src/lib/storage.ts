import { appEnv } from './env';
import { supabaseClient } from '../providers/supabaseClient';

export const PROJECT_FILES_BUCKET = 'project-files';
export const SIGNED_URL_EXPIRY_SECONDS = 60;

export function sanitizeStorageFileName(fileName: string): string {
  const trimmed = fileName.trim().replace(/[/\\]+/g, '_');
  const withoutControlChars = Array.from(trimmed)
    .filter((ch) => (ch.codePointAt(0) ?? 0) > 0x1f)
    .join('');
  return withoutControlChars.length > 0 ? withoutControlChars : 'artifact.bin';
}

export function buildUniqueStoragePath(
  projectId: string,
  fileName: string,
  uuid: string = globalThis.crypto.randomUUID(),
): string {
  const safeName = sanitizeStorageFileName(fileName);
  return `${projectId}/${uuid}/${safeName}`;
}

export function validateUploadFileSize(
  fileSizeBytes: number,
  maxUploadBytes: number = appEnv.maxUploadBytes,
): boolean {
  return fileSizeBytes >= 0 && fileSizeBytes <= maxUploadBytes;
}

function encodeObjectPath(storagePath: string): string {
  return storagePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export interface UploadFileOptions {
  projectId: string;
  file: File;
  onProgress?: (percent: number) => void;
}

export interface UploadedFileResult {
  storagePath: string;
  fileName: string;
  fileSize: number;
}

export async function uploadProjectFileWithProgress({
  projectId,
  file,
  onProgress,
}: UploadFileOptions): Promise<UploadedFileResult> {
  if (!validateUploadFileSize(file.size)) {
    throw new Error(`File exceeds maximum upload size of ${appEnv.maxUploadMb} MB.`);
  }

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !sessionData.session?.access_token) {
    throw new Error('Authentication session expired. Sign in again.');
  }

  const storagePath = buildUniqueStoragePath(projectId, file.name);
  const endpoint = `${appEnv.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/${PROJECT_FILES_BUCKET}/${encodeObjectPath(storagePath)}`;
  const accessToken = sessionData.session.access_token;

  onProgress?.(0);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', appEnv.supabaseAnonKey);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        const pct = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress?.(pct);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      let message = `Storage upload failed (${xhr.status}).`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        if (parsed.message) {
          message = parsed.message;
        } else if (parsed.error) {
          message = parsed.error;
        }
      } catch {
        // Keep fallback status message
      }
      reject(new Error(message));
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error while uploading file to Supabase Storage.'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('File upload was cancelled.'));
    });

    xhr.send(file);
  });

  return {
    storagePath,
    fileName: sanitizeStorageFileName(file.name),
    fileSize: file.size,
  };
}

export async function createShortLivedDownloadUrl(
  storagePath: string,
  downloadFileName?: string | null,
): Promise<string> {
  const { data, error } = await supabaseClient.storage
    .from(PROJECT_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS, {
      download: downloadFileName || true,
    });

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Could not create signed download URL.');
  }

  return data.signedUrl;
}

export async function triggerSignedFileDownload(
  storagePath: string,
  downloadFileName?: string | null,
): Promise<void> {
  const signedUrl = await createShortLivedDownloadUrl(storagePath, downloadFileName);
  const anchor = document.createElement('a');
  anchor.href = signedUrl;
  if (downloadFileName) {
    anchor.download = downloadFileName;
  }
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
