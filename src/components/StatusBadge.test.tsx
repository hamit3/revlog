import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBadge, type BadgeKind } from './StatusBadge';
import { translateText } from '../providers/i18nProvider';

vi.mock('@refinedev/core', () => ({
  useTranslate: () => (key: string, options?: Record<string, unknown>, defaultMessage?: string) =>
    translateText(key, options, defaultMessage),
}));

describe('StatusBadge', () => {
  const kinds: BadgeKind[] = ['published', 'draft', 'archived', 'latest', 'in_review', 'approved'];

  it.each(kinds)('renders badge for kind "%s" cleanly', (kind) => {
    const html = renderToStaticMarkup(<StatusBadge kind={kind} />);
    expect(html).toBeTruthy();
    if (kind === 'in_review') {
      expect(html).toContain('In review');
    }
    if (kind === 'approved') {
      expect(html).toContain('Approved');
    }
    if (kind === 'published') {
      expect(html).toContain('Published');
    }
    if (kind === 'draft') {
      expect(html).toContain('Draft');
    }
    if (kind === 'archived') {
      expect(html).toContain('Archived');
    }
    if (kind === 'latest') {
      expect(html).toContain('Latest');
    }
  });
});
