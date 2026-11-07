import dayjs from 'dayjs';

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatReleaseDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.format('DD MMM YYYY') : '—';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const parsed = dayjs(iso);
  return parsed.isValid() ? parsed.format('DD MMM YYYY, HH:mm') : '—';
}
