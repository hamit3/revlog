import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './svgSanitizer';

describe('svgSanitizer', () => {
  it('preserves valid SVG geometric elements and attributes', () => {
    const validSvg =
      '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="green" stroke="black" /></svg>';
    const sanitized = sanitizeSvg(validSvg);
    expect(sanitized).toContain('<circle');
    expect(sanitized).toContain('fill="green"');
  });

  it('removes <script> tags from SVG', () => {
    const maliciousSvg = '<svg><circle cx="10" cy="10" r="5" /><script>alert("xss")</script></svg>';
    const sanitized = sanitizeSvg(maliciousSvg);
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('alert');
    expect(sanitized).toContain('<circle');
  });

  it('removes <foreignObject> tags from SVG', () => {
    const foreignObjectSvg =
      '<svg><foreignObject width="100" height="50"><body xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></body></foreignObject></svg>';
    const sanitized = sanitizeSvg(foreignObjectSvg);
    expect(sanitized).not.toContain('foreignObject');
    expect(sanitized).not.toContain('<script');
  });

  it('removes inline event handlers (onload, onerror, onclick)', () => {
    const handlerSvg =
      '<svg onload="alert(1)"><rect width="100" height="100" onclick="stealCookies()" onmouseover="evil()" /></svg>';
    const sanitized = sanitizeSvg(handlerSvg);
    expect(sanitized).not.toContain('onload');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('onmouseover');
  });

  it('handles empty or null input gracefully', () => {
    expect(sanitizeSvg('')).toBe('');
  });
});
