import { expect, type Page, test } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
  return errors;
}

async function readScore(page: Page): Promise<number> {
  return Number(await page.locator('#score-display').textContent());
}

test('boots from same-origin assets under the CSP and runs a race', async ({ page }) => {
  const errors = collectErrors(page);
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== 'http://127.0.0.1:4173') foreign.push(request.url());
  });

  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("script-src 'self'");
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#game-container canvas')).toHaveCount(1);

  await page.locator('#start-btn').click();
  await expect(page.locator('#start-screen')).toBeHidden();
  await expect.poll(() => readScore(page), { timeout: 5_000 }).toBeGreaterThan(0);
  await expect(page.locator('#speed-display')).toHaveText(/\d{2} MPH/);

  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test('Space after using the pause button jumps instead of re-pausing', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-btn').click();
  await page.locator('#pause-btn').click();
  await expect(page.locator('#pause-screen')).toBeVisible();

  await page.locator('#resume-btn').click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  await page.locator('#pause-btn').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#pause-screen')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  const frozen = await readScore(page);
  await page.waitForTimeout(400);
  expect(await readScore(page)).toBe(frozen);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-screen')).toBeHidden();
});

test('restarting from the pause menu resets the run', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-btn').click();
  await expect.poll(() => readScore(page), { timeout: 15_000 }).toBeGreaterThan(5);
  await page.keyboard.press('Escape');
  const beforeRestart = await readScore(page);
  await page.locator('#pause-restart-btn').click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  expect(await readScore(page)).toBeLessThan(beforeRestart);
  await expect(page.locator('#level-display')).toHaveText('1985');
});

test('still boots and plays when localStorage is blocked', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#highscore-display')).toHaveText('000000');
  await page.locator('#start-btn').click();
  await expect.poll(() => readScore(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('shows a fallback instead of crashing without WebGL', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    const proto = HTMLCanvasElement.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'getContext')?.value as (...args: unknown[]) => unknown;
    Object.defineProperty(proto, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return type.startsWith('webgl') ? null : original.call(this, type, ...rest);
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#unsupported-screen')).toBeVisible();
  await expect(page.locator('#start-screen')).toBeHidden();
  await expect(page.locator('#game-container canvas')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('pauses automatically when the tab is hidden', async ({ page }) => {
  await page.goto('/');
  await page.locator('#start-btn').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#pause-screen')).toBeVisible();
});
