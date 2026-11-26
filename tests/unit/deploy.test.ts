import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const headers = JSON.parse(read('security-headers.json')) as Record<string, string>;
const nginx = read('deploy/nginx.conf');

describe('security headers', () => {
  it('locks scripts, styles and connections to the game origin', () => {
    const csp = headers['Content-Security-Policy'] ?? '';
    for (const directive of [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
  });

  it.each(Object.entries(headers))('nginx sends %s on every location', (name, value) => {
    const line = `add_header ${name} "${value}" always;`;
    const locationsWithHeaders = nginx.split('add_header Cache-Control').length - 1;
    expect(nginx.split(line).length - 1).toBe(locationsWithHeaders + 1);
  });
});
