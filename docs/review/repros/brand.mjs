import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://127.0.0.1:3012';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 400, height: 200 } })).newPage();
await p.goto(BASE + '/favicon.ico');
await p.goto(BASE);
await p.evaluate(() => {
  document.body.innerHTML = `<div id=t style="position:fixed;inset:0;z-index:99999;background:#0d1b2a;display:flex;gap:16px;padding:16px;align-items:center">
  <img src="/brand/app-16.png?v=2" width=16 height=16><img src="/favicon.ico?v=2" width=16 height=16><img src="/brand/seven-powers-mark-256.png?v=2" width=16 height=16>
  <img src="/brand/seven-powers-mark-256.png?v=2" width=38 height=38><span style="background:#f4efe6;padding:8px;display:inline-flex"><img src="/brand/seven-powers-mark-256.png?v=2" width=38 height=38><img src="/brand/app-32.png?v=2" width=32 height=32></span></div>`;
});
await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth));
await p.screenshot({ path: 'docs/review/evidence/brand-small.png', clip: { x: 0, y: 70, width: 300, height: 60 } });
await b.close();
