/* Run against the dev server or the production build. Uses rendered UI only. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/bank.json'), 'utf8'));
const base = (process.env.BASE_URL || 'http://127.0.0.1:4175/quiz/').replace(/\/?$/, '/');
const windowsChrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const chrome = process.env.CHROME_PATH || (fs.existsSync(windowsChrome) ? windowsChrome : undefined);

function referenceCode(chain) {
  const question = bank.questions.find(
    (q) => q.id.startsWith('oral:' + chain + ':') && (q.detail?.code || q.explanation.includes('↵')),
  );
  assert.ok(question, 'Missing reference implementation for ' + chain);
  return question.detail?.code || question.explanation.split('↵').slice(1).join('\n');
}

(async () => {
  const browser = await chromium.launch({headless: true, ...(chrome ? {executablePath: chrome} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}}),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '#/practice?mode=quiz&topic=0');
    await page.locator('.question-prompt').waitFor();
    assert.equal(await page.locator('.answer-content').count(), 0);
    assert.ok(await page.getByRole('button', {name: '提交并查看解析'}).isDisabled());
    await page.locator('.choice').first().click();
    await page.getByRole('button', {name: '提交并查看解析'}).click();
    await page.locator('.answer-content').waitFor();
    await page.getByRole('button', {name: '我的笔记', exact: true}).click();
    await page.locator('#practice-note').fill('复习笔记 <script> 按原文显示');
    await page.getByRole('button', {name: '收藏这题'}).click();
    // A forced reload immediately after writing checks the crash-recovery journal.
    await page.reload();
    await page.locator('.answer-content').waitFor();
    await page.getByRole('button', {name: '我的笔记 · 已记录'}).click();
    assert.equal(await page.locator('#practice-note').inputValue(), '复习笔记 <script> 按原文显示');
    assert.ok(await page.getByRole('button', {name: '已收藏', exact: true}).isVisible());

    await page.goto(base + '#/practice?mode=oral&chain=loop');
    await page.locator('#response').fill('先确认执行上下文，再按任务和微任务推导。');
    await page.getByRole('button', {name: '提交并查看解析'}).click();
    await page.getByRole('button', {name: '基本掌握', exact: true}).click();
    assert.ok(await page.getByRole('button', {name: '基本掌握', exact: true}).isDisabled());
    await page.getByRole('button', {name: '下一题', exact: true}).click();
    assert.match(await page.locator('.question-counter').textContent(), /2 \/ 4/);
    await page.goto(base + '#/practice?mode=mock');
    for (let index = 0; index < 12; index++) {
      await page.locator('#response').fill('独立回答，标明前提、过程、证据和边界。第 ' + index + ' 问。');
      assert.equal(
        await page.locator('.answer-content').count(),
        0,
        'Blind interview must not reveal reference answers',
      );
      await page.getByRole('button', {name: index === 11 ? '结束并复盘' : '记录并继续', exact: true}).click();
    }
    await page.locator('.summary-hero').waitFor();
    assert.equal(await page.locator('.recap-item').count(), 12);
    await page.locator('.recap-item summary').first().click();
    assert.ok(await page.locator('.recap-item .answer-content').first().isVisible());
    await page.goto(base + '#/practice?mode=daily');
    await page.locator('.question-prompt').waitFor();
    await page.setViewportSize({width: 390, height: 844});
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'Mobile horizontal overflow',
    );

    const expectedCounts = {window: 3, binary: 3, interval: 3, bfs: 3, dp: 3, lru: 5, tree: 7};
    for (const [chain, count] of Object.entries(expectedCounts)) {
      await page.goto(base + '#/practice?mode=oral&chain=' + chain);
      await page.locator('.code-lab summary').click();
      await page.getByLabel('代码编辑器').fill(referenceCode(chain));
      await page.getByRole('button', {name: '运行用例', exact: true}).click();
      await page.locator('.test-row').first().waitFor();
      assert.equal(
        await page.locator('.test-row.passed').count(),
        count,
        chain + ' reference implementation',
      );
      assert.equal(await page.locator('.test-row:not(.passed)').count(), 0);
    }
    await page.getByLabel('代码编辑器').fill('function moveCheck(){while(true){}}');
    await page.getByRole('button', {name: '运行用例', exact: true}).click();
    await page.getByText('运行超过 3 秒，已停止。检查循环终止条件。', {exact: true}).waitFor();

    const attemptedRequests = [],
      externalResponses = [];
    page.on('request', (request) => {
      if (request.url().startsWith('https://example.com/')) attemptedRequests.push(request);
    });
    page.on('response', (response) => {
      if (response.url().startsWith('https://example.com/')) externalResponses.push(response.url());
    });
    for (const operation of [
      'await fetch("https://example.com/")',
      'await import("https://example.com/module.js")',
    ]) {
      await page
        .getByLabel('代码编辑器')
        .fill('async function moveCheck(){' + operation + ';return "valid"}');
      await page.getByRole('button', {name: '运行用例', exact: true}).click();
      await page.locator('.test-row').first().waitFor();
      assert.equal(await page.locator('.test-row.passed').count(), 0);
    }
    // Chromium reports a request event for blocked dynamic imports; its failure is explicitly CSP.
    assert.deepEqual(externalResponses, [], 'Sandbox must not receive external responses');
    assert.ok(
      attemptedRequests.every((request) => /csp/i.test(request.failure()?.errorText || '')),
      'Every dynamic import attempt must be blocked by CSP before network access',
    );
    assert.equal(
      await page.locator('iframe[title="代码运行沙箱"]').count(),
      0,
      'Sandbox must be removed after execution',
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        base,
        answerGating: true,
        instantReload: true,
        oralSelfGrade: true,
        blindMockQuestions: 12,
        dailyPlan: true,
        mobileOverflow: false,
        codeCases: 27,
        timeout: true,
        networkAndImportBlocked: true,
      }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
