import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('http://localhost:5173/#/editor/wf-1772470073926');
await page.waitForTimeout(3000);

await page.click('text=執行記錄器');
await page.waitForTimeout(1000);

await page.screenshot({ path: '/tmp/flowcraft-ui.png' });
console.log('Screenshot: /tmp/flowcraft-ui.png');

const text = await page.locator('.execution-logger-config').textContent().catch(() => 'NOT FOUND');
console.log(text);

await page.waitForTimeout(8000);
await browser.close();
