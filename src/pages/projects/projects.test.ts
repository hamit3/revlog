import { describe, expect, it } from 'vitest';
import { pickLatestPublishedRelease } from './list';
import { formatFileSize, formatReleaseDate } from '../../lib/format';

describe('Projects list and formatting helpers', () => {
  it('picks the latest published release while ignoring drafts', () => {
    const latest = pickLatestPublishedRelease([
      {
        id: '1',
        version_label: 'Rev A',
        status: 'published',
        published_at: '2026-09-01T10:00:00Z',
      },
      {
        id: '2',
        version_label: 'Rev C-draft',
        status: 'draft',
        published_at: null,
      },
      {
        id: '3',
        version_label: 'Rev B',
        status: 'published',
        published_at: '2026-10-15T12:00:00Z',
      },
    ]);

    expect(latest?.id).toBe('3');
    expect(latest?.version_label).toBe('Rev B');
  });

  it('formats file sizes and release dates cleanly', () => {
    expect(formatFileSize(null)).toBe('—');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(14820)).toBe('14 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatReleaseDate('2026-11-12T10:00:00Z')).toBe('12 Nov 2026');
  });
});
