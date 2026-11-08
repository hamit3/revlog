/**
 * Sanitizes SVG markup to prevent Cross-Site Scripting (XSS).
 * Removes dangerous tags (<script>, <foreignObject>, <iframe>, <object>, <embed>)
 * and inline event handlers (on* attributes) or javascript: URLs.
 */
export function sanitizeSvg(rawSvg: string): string {
  if (!rawSvg) {
    return '';
  }

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawSvg, 'image/svg+xml');

      // Check for parser errors
      if (doc.querySelector('parsererror')) {
        return stripDangerousSvgPatterns(rawSvg);
      }

      const dangerousTags = [
        'script',
        'foreignobject',
        'iframe',
        'embed',
        'object',
        'applet',
        'meta',
        'link',
      ];
      for (const tag of dangerousTags) {
        const elements = doc.querySelectorAll(tag);
        elements.forEach((el) => el.remove());
      }

      const allElements = doc.querySelectorAll('*');
      allElements.forEach((el) => {
        const attributesToRemove: string[] = [];
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          if (attr) {
            const name = attr.name.toLowerCase();
            const val = attr.value.toLowerCase().trim();
            if (name.startsWith('on') || val.startsWith('javascript:')) {
              attributesToRemove.push(attr.name);
            }
          }
        }
        attributesToRemove.forEach((attrName) => el.removeAttribute(attrName));
      });

      const serializer = new XMLSerializer();
      return serializer.serializeToString(doc.documentElement);
    } catch {
      return stripDangerousSvgPatterns(rawSvg);
    }
  }

  return stripDangerousSvgPatterns(rawSvg);
}

function stripDangerousSvgPatterns(svg: string): string {
  return svg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href=""');
}
