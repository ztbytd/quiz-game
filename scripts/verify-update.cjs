/* Production SW update check. Serves an in-memory dist snapshot; never modifies build artifacts. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');

const dist = path.resolve(__dirname, '../dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

async function snapshot(directory, prefix = '') {
  const files = new Map();
  for (const entry of await fs.readdir(directory, {withFileTypes: true})) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) {
      for (const [nested, bytes] of await snapshot(path.join(directory, entry.name), name + '/')) {
        files.set(nested, bytes);
      }
    } else if (entry.isFile()) files.set(name, await fs.readFile(path.join(directory, entry.name)));
  }
  return files;
}

async function workerVersion(page, waiting = false) {
  return page.evaluate(async (waiting) => {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker = waiting ? registration?.waiting : navigator.serviceWorker.controller;
    if (!worker) throw Error('Missing ' + (waiting ? 'waiting worker' : 'controller'));
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(Error('Worker version response timed out'));
      }, 3000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };
      worker.postMessage({type: 'VERIFY_UPDATE_VERSION'}, [channel.port2]);
    });
  }, waiting);
}

(async () => {
  const files = await snapshot(dist);
  assert.ok(files.has('sw.js') && files.has('index.html'), 'Run npm run build first');
  let version = 1;
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const name = pathname === '/quiz/' ? 'index.html' : pathname.replace(/^\/quiz\//, '');
    if (!pathname.startsWith('/quiz/') || !files.has(name)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    let bytes = files.get(name);
    if (name === 'sw.js') {
      // This test-only listener observes controller identity without changing Workbox update behavior.
      bytes = Buffer.concat([
        bytes,
        Buffer.from(
          `\n// verify-update build v${version}\n` +
            `self.addEventListener('message',event=>{if(event.data?.type==='VERIFY_UPDATE_VERSION')event.ports[0]?.postMessage('v${version}');});\n`,
        ),
      ]);
    }
    response.writeHead(200, {
      'Content-Type': mime[path.extname(name)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      ...(name === 'sw.js' ? {'Service-Worker-Allowed': '/quiz/'} : {}),
    });
    response.end(bytes);
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}/quiz/`;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}),
    });
    const context = await browser.newContext();
    await context.addInitScript(() => {
      sessionStorage.setItem(
        'verify-update-loads',
        String(Number(sessionStorage.getItem('verify-update-loads') || 0) + 1),
      );
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        sessionStorage.setItem(
          'verify-update-controller-changes',
          String(Number(sessionStorage.getItem('verify-update-controller-changes') || 0) + 1),
        );
      });
    });
    const page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '#/profile');
    await page.locator('.goal-options').waitFor();
    await page.waitForFunction(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated',
    );
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.locator('.goal-options').waitFor();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await workerVersion(page), 'v1');
    await page.locator('.goal-options button').filter({hasText: '15'}).click();
    await page.goto(base + '#/practice?mode=quiz&topic=0');
    await page.locator('.question-prompt').waitFor();
    await page.getByRole('button', {name: '我的笔记', exact: true}).click();
    await page.locator('#practice-note').fill('更新前的笔记：事件循环需要说明执行顺序。');
    await page.locator('.choice').first().click();
    await page.getByRole('button', {name: '提交并查看解析', exact: true}).click();
    await page.locator('.answer-content').waitFor();
    const loadsBefore = await page.evaluate(() => Number(sessionStorage.getItem('verify-update-loads')));
    const changesBefore = await page.evaluate(() =>
      Number(sessionStorage.getItem('verify-update-controller-changes') || 0),
    );

    version = 2;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting);
    await page.getByRole('button', {name: '保存并更新', exact: true}).waitFor();
    assert.equal(await workerVersion(page), 'v1', 'Waiting update must not activate automatically');
    assert.equal(await workerVersion(page, true), 'v2');
    // Keep editing while the update waits: no automatic reload may interrupt an answer or note.
    const savedNote = '更新等待时继续编辑的笔记 <script>原文</script>，更新后必须完整保留。';
    await page.locator('#practice-note').fill(savedNote);
    await page.waitForTimeout(1200);
    assert.equal(
      await page.evaluate(() => Number(sessionStorage.getItem('verify-update-loads'))),
      loadsBefore,
    );
    assert.equal(
      await page.evaluate(() => Number(sessionStorage.getItem('verify-update-controller-changes') || 0)),
      changesBefore,
    );
    assert.equal(await workerVersion(page), 'v1');

    await page.getByRole('button', {name: '保存并更新', exact: true}).click();
    await page.waitForFunction(
      (before) => Number(sessionStorage.getItem('verify-update-loads')) > before,
      loadsBefore,
    );
    await page.locator('.answer-content').waitFor();
    assert.equal(await workerVersion(page), 'v2', 'Accepted update must switch the page controller');
    assert.ok(
      await page.evaluate(
        (before) => Number(sessionStorage.getItem('verify-update-controller-changes') || 0) > before,
        changesBefore,
      ),
    );
    assert.equal(await page.getByRole('button', {name: '保存并更新', exact: true}).count(), 0);
    await page.getByRole('button', {name: '我的笔记 · 已记录', exact: true}).click();
    assert.equal(await page.locator('#practice-note').inputValue(), savedNote);
    await page.goto(base + '#/profile');
    await page.locator('.goal-options button.active').waitFor();
    assert.match(await page.locator('.goal-options button.active').innerText(), /^15\s/);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        productionUpdate: true,
        from: 'v1',
        to: 'v2',
        waitingPrompt: true,
        noAutomaticReload: true,
        controllerChanged: true,
        goalPreserved: 15,
        notePreserved: true,
        sessionPreserved: true,
      }),
    );
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
