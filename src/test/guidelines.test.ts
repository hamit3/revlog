import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokens } from '../theme/tokens';
import en from '../i18n/en.json';

function collectFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function collectJsonStrings(node: unknown): string[] {
  if (typeof node === 'string') {
    return [node];
  }
  if (typeof node === 'object' && node !== null) {
    return Object.values(node).flatMap((child) => collectJsonStrings(child));
  }
  return [];
}

describe('Design guidelines, WCAG AA contrast and copy compliance', () => {
  it('contains zero hardcoded color literals outside src/theme/tokens.ts', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const tokensPath = path.resolve(srcDir, 'theme', 'tokens.ts');
    const files = collectFiles(srcDir, ['.ts', '.tsx', '.css']).filter(
      (file) => file !== tokensPath && !file.includes('.test.'),
    );

    const colorRegex = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/g;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const matches = content.match(colorRegex);
      expect(matches, `Unexpected hardcoded color in ${file}`).toBeNull();
    }
  });

  it('meets WCAG AA 4.5:1 text contrast across primary, secondary, accent and semantic tokens', () => {
    expect(
      contrastRatio(tokens.colors.textPrimary, tokens.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colors.textPrimary, tokens.colors.surface)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(tokens.colors.textSecondary, tokens.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.colors.textSecondary, tokens.colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colors.accent, tokens.colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.colors.accent, tokens.colors.surfaceSelected),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colors.white, tokens.colors.accent)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(tokens.colors.publishedText, tokens.colors.publishedBg),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colors.errorText, tokens.colors.errorBg)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(tokens.colors.warningText, tokens.colors.warningBg),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(tokens.colors.draftText, tokens.colors.draftBg)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('keeps i18n copy neutral without exclamation marks and includes mandatory notices', () => {
    const allStrings = collectJsonStrings(en);
    expect(allStrings.length).toBeGreaterThan(50);

    for (const text of allStrings) {
      expect(text.includes('!'), `Exclamation mark found in copy: "${text}"`).toBe(false);
      expect(text.toLowerCase()).not.toContain('welcome back');
    }

    expect(allStrings).toContain(
      'Links point to external resources. Their content is not verified.',
    );
    expect(allStrings).toContain('Once published, this release cannot be changed.');
  });

  it('enforces standardized typography without inline fontSize overrides, root font-size lock or non-hash monospace', () => {
    const rootDir = process.cwd();
    const srcDir = path.resolve(rootDir, 'src');
    const uiFiles = [
      ...collectFiles(path.resolve(srcDir, 'components'), ['.ts', '.tsx']),
      ...collectFiles(path.resolve(srcDir, 'pages'), ['.ts', '.tsx']),
    ].filter((file) => !file.includes('.test.'));

    for (const file of uiFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content.match(/\bfontSize\s*:/g), `Inline fontSize override in ${file}`).toBeNull();
      expect(content.match(/\brevlog-mono\b/g), `Legacy revlog-mono class in ${file}`).toBeNull();
    }

    const indexCss = fs.readFileSync(path.resolve(srcDir, 'index.css'), 'utf-8');
    expect(indexCss).not.toMatch(/html[^{]*\{[^}]*font-size/s);
    expect(indexCss).not.toMatch(/:root[^{]*\{[^}]*font-size/s);
    expect(indexCss).not.toMatch(/font-size:\s*\d+px/);

    const indexHtml = fs.readFileSync(path.resolve(rootDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('<meta name="text-scale" content="scale" />');
  });
});
