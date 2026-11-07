import type { I18nProvider } from '@refinedev/core';
import en from '../i18n/en.json';

type TranslationNode = string | { [key: string]: TranslationNode };

function resolveKey(tree: TranslationNode, path: string): string | undefined {
  const segments = path.split('.');
  let current: TranslationNode | undefined = tree;

  for (const segment of segments) {
    if (typeof current !== 'object' || current === null || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, options?: Record<string, unknown>): string {
  if (!options) {
    return template;
  }
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    const value = options[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function translateText(
  key: string,
  options?: Record<string, unknown>,
  defaultMessage?: string,
): string {
  const found = resolveKey(en as TranslationNode, key);
  const base = found ?? defaultMessage ?? key;
  return interpolate(base, options);
}

export const i18nProvider: I18nProvider = {
  translate: (key: string, options?: unknown, defaultMessage?: string): string => {
    if (typeof options === 'string') {
      return translateText(key, undefined, options);
    }
    const recordOptions =
      typeof options === 'object' && options !== null
        ? (options as Record<string, unknown>)
        : undefined;
    return translateText(key, recordOptions, defaultMessage);
  },
  changeLocale: async () => Promise.resolve(),
  getLocale: () => 'en',
};
