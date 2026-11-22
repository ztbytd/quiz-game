'use strict';
const Practice = (() => {
  const root = document.getElementById('practiceHost').attachShadow({mode: 'open'});
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = new URL('practice.css?v=3', document.baseURI).href;
  root.append(sheet);
  const layout = document.createElement('template');
  layout.innerHTML =
    '<header class="nav"><div class="shell"><button class="word" id="back-game">← 返回闯关</button><nav class="navlinks" aria-label="主导航"><button id="catalog">专题目录</button><button id="weak">薄弱题</button></nav></div></header>\n<main id="app" class="shell"></main><div class="shell savelabel" id="save-warning" role="status"></div>';
  root.append(layout.content.cloneNode(true));

  const bank = PRACTICE_BANK;
  const cards = bank.cards,
    groups = bank.groups,
    app = root.querySelector('#app');
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  const inGroup = (id) => groups.find((g) => g.id === id).cards;
  const tracks = {
    'resume-data': {name: '简历：数据与部署', ids: inGroup('resume-data')},
    'resume-ui': {name: '简历：前端与跨端', ids: inGroup('resume-ui')},
    'resume-integration': {name: '简历：AI 与集成', ids: inGroup('resume-integration')},
    runtime: {name: 'Node 运行机制', ids: inGroup('runtime-deep')},
    media: {name: '视频与移动端', ids: inGroup('media-deep')},
    quality: {name: '测试与国际化', ids: inGroup('quality-deep')},
    language: {name: 'JS / TS 深入', ids: inGroup('language-deep')},
    framework: {name: '框架进阶', ids: inGroup('framework-deep')},
    platform: {name: '浏览器与工程化', ids: inGroup('platform-deep')},
    system: {name: '系统设计', ids: inGroup('system-deep')},
    ai: {name: 'AI 应用', ids: inGroup('ai')},
    network: {name: '计算机网络', ids: [...inGroup('netcases'), 'network', 'origin', 'socket', 'range']},
    security: {name: 'Web 安全', ids: [...inGroup('security'), 'revoke', 'preview']},
    scenes: {
      name: '综合场景题',
      ids: [...inGroup('field'), 'control', 'merge', 'parity', 'play', 'coverage', 'incident'],
    },
  };
  const storeKey = 'frontend-deep-review-2026-v1';
  const refs = {
    vue: ['Vue · 响应式基础', 'https://vuejs.org/guide/essentials/reactivity-fundamentals.html'],
    react: ['React · 渲染状态快照', 'https://react.dev/learn/state-as-a-snapshot'],
    ts: ['TypeScript · 类型收窄', 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html'],
    network: ['MDN · HTTP 缓存', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching'],
    merge: ['Redis · 分布式锁', 'https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/'],
    split: ['微信支付 · 服务商查询分账结果', 'https://pay.wechatpay.cn/doc/v3/partner/4012466850'],
    node: [
      'Node.js · 事件循环与工作线程池',
      'https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop',
    ],
    tools: ['MCP · 架构', 'https://modelcontextprotocol.io/docs/learn/architecture'],
    stream: [
      'MDN · 读取流',
      'https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams',
    ],
    measure: ['web.dev · Web Vitals', 'https://web.dev/articles/vitals'],
    play: [
      'MDN · Intersection Observer',
      'https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API',
    ],
    range: ['MDN · HTTP 范围请求', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests'],
    hydrate: ['React · hydrateRoot', 'https://react.dev/reference/react-dom/client/hydrateRoot'],
  };
  const selectionSources = [
    [
      'Atlassian · Frontend Engineering Interview Guide',
      'https://wac-cdn.atlassian.com/dam/jcr:c0aa929a-3391-4e9c-9202-3f3ba0eeb859/P30-P50-Frontend-Interview-Guide.pdf',
    ],
    [
      'Front End Interview Handbook · 复习方向目录',
      'https://github.com/yangshun/front-end-interview-handbook',
    ],
    [
      'H5BP · Front-end Developer Interview Questions',
      'https://github.com/h5bp/Front-end-Developer-Interview-Questions',
    ],
    [
      'Front End Interview Handbook · 系统设计',
      'https://www.frontendinterviewhandbook.com/front-end-system-design',
    ],
  ];
  const diagnostics = ['loop:0', 'react:0', 'pool:0', 'parity:2', 'split:2', 'window:0'];
  const total = Object.values(cards).reduce((n, c) => n + c.steps.length, 0);
  let saved = {grades: {}, notes: {}, session: null};
  try {
    const previous = JSON.parse(localStorage.getItem(storeKey));
    if (previous && previous.grades && previous.notes) saved = previous;
  } catch {}
  function persist() {
    if (saved.session?.mode === 'mock') {
      if (saved.session.track) {
        saved.trackMocks ||= {};
        saved.trackMocks[saved.session.track] = saved.session;
      } else saved.mock = saved.session;
    }
    try {
      localStorage.setItem(storeKey, JSON.stringify(saved));
    } catch {
      root.querySelector('#save-warning').textContent = '浏览器未能保存到本机，本次打开期间仍可练习。';
    }
  }
  function el(tag, cls, txt) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  }
  function btn(label, fn, cls = 'btn') {
    const n = el('button', cls, label);
    n.type = 'button';
    n.addEventListener('click', fn);
    return n;
  }
  function idParts(key) {
    const [cid, raw] = key.split(':');
    return [cards[cid], Number(raw)];
  }
  function weakKeys() {
    return Object.keys(saved.grades).filter(
      (k) => saved.grades[k] === 'weak' && idParts(k)[0]?.steps[idParts(k)[1]],
    );
  }
  function weakHeader() {
    root.querySelector('#weak').textContent =
      '薄弱题' + (weakKeys().length ? ' (' + weakKeys().length + ')' : '');
  }
  function topView() {
    app.replaceChildren();
    weakHeader();
    window.scrollTo(0, 0);
  }
  function cardSession(c, track) {
    begin(
      c.title,
      c.steps.map((_, i) => c.id + ':' + i),
      track,
    );
  }
  function begin(title, queue, track) {
    saved.session = {title, queue, index: 0, reveal: false, round: {}, track};
    persist();
    question();
  }
  function home(focusCatalog = false) {
    topView();
    const hero = el('section', 'hero'),
      lead = el('div', 'lead'),
      side = el('div', 'side');
    lead.append(
      el('h1', '', '高级前端面试深练'),
      el('p', '', '从基础原理、项目取舍和现场手写中抽 6 问，先找到最容易卡住的地方。'),
      btn('开始 6 题自测', () => begin('考前自测', diagnostics.slice()), 'btn lime'),
    );
    if (saved.session && saved.session.index < saved.session.queue.length) {
      side.append(
        el('h2', '', '继续上次练习'),
        el(
          'p',
          '',
          saved.session.title +
            ' · 第 ' +
            (saved.session.index + 1) +
            ' / ' +
            saved.session.queue.length +
            ' 问',
        ),
        btn('回到题目 →', question, 'jump'),
      );
    } else {
      side.append(
        el('h2', '', '练一次项目深挖'),
        el('p', '', '同一笔上传出现两个合并任务，锁过期后，谁有权发布最终文件？'),
        btn('练分片合并 · 6 问 →', () => cardSession(cards.merge), 'jump'),
      );
    }
    if (saved.mock?.index === saved.mock?.queue?.length && saved.mock) {
      side.append(
        btn(
          '查看上场模拟复盘 →',
          () => {
            saved.session = saved.mock;
            persist();
            finish();
          },
          'jump',
        ),
      );
    }
    side.append(btn('现场手写 · 运行用例 →', () => cardSession(cards.window), 'jump'));
    hero.append(lead, side);
    app.append(hero);
    const shortcuts = el('nav', 'actions');
    shortcuts.setAttribute('aria-label', '按方向复习');
    for (const [key, track] of Object.entries(tracks)) {
      shortcuts.append(btn(track.name, () => openPractice('track-' + key)));
    }
    app.append(shortcuts);
    app.append(btn('查看简历逐项对照', () => openPractice('resume-audit'), 'jump'));
    app.append(btn('查看选题参考与答案资料', () => openPractice('sources'), 'jump'));
    const section = el('section'),
      head = el('div', 'sectionhead');
    head.append(
      el('h2', '', '按专题练习'),
      el('span', 'meta', groups.length + ' 个专题 · ' + Object.keys(cards).length + ' 组 · ' + total + ' 问'),
    );
    const search = el('input', 'search');
    search.type = 'search';
    search.placeholder = '搜索专题、问题或关键词，例如「断点续传」';
    search.setAttribute('aria-label', '搜索题库');
    const grid = el('div', 'grid');
    section.append(head, search, grid);
    app.append(section);
    function filter() {
      grid.replaceChildren();
      const term = search.value.trim().toLowerCase();
      for (const g of groups) {
        const matches = g.cards.filter((id) => {
          const c = cards[id];
          return !term || [g.name, c.title, ...c.steps.flat()].join(' ').toLowerCase().includes(term);
        });
        if (!matches.length) continue;
        const group = el('details', 'topic'),
          summary = el('summary', '', g.name);
        summary.append(el('span', '', matches.length + ' 组'));
        group.append(summary);
        group.open = !!term;
        for (const id of matches) {
          const c = cards[id],
            b = btn(c.title, () => cardSession(c), 'row');
          b.append(el('small', '', c.steps.length + ' 问 →'));
          group.append(b);
        }
        grid.append(group);
      }
      if (!grid.children.length) grid.append(el('p', 'empty', '没有匹配的题目，试试更短的关键词。'));
    }
    filter();
    search.oninput = filter;
    app.append(
      el(
        'footer',
        'foot',
        '答案用作对照，项目经历以你亲自实现或核实过的内容为准。作答和自评保存在当前浏览器。',
      ),
    );
    if (focusCatalog) {
      section.scrollIntoView();
      search.focus({preventScroll: true});
    }
  }
  function showTrack(key) {
    const track = tracks[key];
    topView();
    const wrap = el('section', 'practice'),
      panel = el('article', 'recap');
    const count = track.ids.reduce((sum, id) => sum + cards[id].steps.length, 0);
    panel.append(
      el('h1', '', track.name),
      el('p', 'meta', track.ids.length + ' 组场景 · ' + count + ' 问，可任选一组连续练习。'),
    );
    panel.append(btn('本方向盲答 · 6 问', () => openPractice('mock-' + key), 'btn green'));
    for (const id of track.ids) {
      const c = cards[id],
        row = btn(c.title, () => openPractice('track-' + key + '/' + id), 'row');
      row.append(el('small', '', c.steps.length + ' 问 →'));
      panel.append(row);
    }
    wrap.append(
      btn('← 全部专题', () => openPractice(), 'jump back'),
      panel,
    );
    app.append(wrap);
  }
  function showSources() {
    topView();
    const wrap = el('section', 'practice'),
      panel = el('article', 'recap');
    panel.append(
      el('h1', '', '选题参考与答案资料'),
      el('p', 'meta', '收集日期 2026-11-22。题目结合公开目录和项目场景编写，答案按对应文档核对。'),
      el('h2', '', '公开题目目录'),
    );
    for (const [name, url] of selectionSources) {
      const link = el('a', 'source-link', name);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      panel.append(link);
    }
    panel.append(el('h2', '', '按题目查看核对资料'));
    for (const group of groups) {
      const withSource = group.cards.filter((id) => cards[id].source || refs[id]);
      if (!withSource.length) continue;
      const section = el('details', 'topic');
      section.append(el('summary', '', group.name + ' · ' + withSource.length + ' 组'));
      for (const id of withSource) {
        const item = el('div', 'source-item');
        item.append(btn(cards[id].title, () => openPractice(id), 'jump'));
        appendSource(item, cards[id]);
        section.append(item);
      }
      panel.append(section);
    }
    wrap.append(
      btn('← 全部专题', () => openPractice(), 'jump back'),
      panel,
    );
    app.append(wrap);
  }
  function showResumeCoverage() {
    topView();
    const wrap = el('section', 'practice'),
      panel = el('article', 'recap');
    panel.append(
      el('h1', '', '简历逐项对照'),
      el(
        'p',
        'meta',
        '按已提供的三页简历核对。每项列出核对前的缺口、当前练习入口和需要你准备的项目证据。掌握程度通过独立作答与代码验证判断。',
      ),
      el('p', 'meta', RESUME_COVERAGE.length + ' 项核对 · 新题为场景练习，个人经历按真实实现补充。'),
      el('p', 'meta', '个人证据笔记保存在当前浏览器。'),
    );
    const label = el('label', 'note', '筛选核对项目');
    const filter = el('select', 'search');
    filter.id = 'coverage-filter';
    label.htmlFor = filter.id;
    for (const [value, text] of [
      ['all', '全部条目'],
      ['added', '本轮补充了追问'],
      ['verify', '需要补充项目事实'],
    ]) {
      const option = el('option', '', text);
      option.value = value;
      filter.append(option);
    }
    const list = el('div', 'coverage-list');
    panel.append(label, filter, list);
    function drawCoverage() {
      list.replaceChildren();
      const visible = RESUME_COVERAGE.filter(
        (item) => filter.value === 'all' || (filter.value === 'added' ? item.added.length : item.verify),
      );
      let section;
      for (const item of visible) {
        if (section !== item.section) {
          section = item.section;
          list.append(el('h2', '', section));
        }
        const detail = el('details', 'topic'),
          summary = el('summary', '', item.title),
          body = el('div', 'mock-detail');
        detail.dataset.coverageId = item.id;
        summary.append(
          el('span', '', item.verify ? '待补项目事实' : item.added.length ? '本轮已补充' : '已有追问'),
        );
        body.append(el('p', 'meta', '简历依据：' + item.basis), el('p', '', '核对前：' + item.before));
        const related = [...new Set([...item.existing, ...item.added])];
        for (const id of related) {
          const row = btn(cards[id].title, () => openPractice(id), 'row');
          row.append(
            el(
              'small',
              '',
              (item.added.includes(id) ? '本轮新增 · ' : '') + cards[id].steps.length + ' 问 →',
            ),
          );
          body.append(row);
        }
        body.append(el('p', 'note', '准备证据：' + item.evidence));
        const noteLabel = el('label', 'note', '我的实际实现与证据'),
          input = el('textarea', 'answerbox');
        input.id = 'evidence-' + item.id;
        noteLabel.htmlFor = input.id;
        input.placeholder = '写下你实际负责的范围、实现取舍、版本和可核实结果';
        input.value = saved.resumeEvidence?.[item.id] || '';
        input.oninput = () => {
          saved.resumeEvidence ||= {};
          saved.resumeEvidence[item.id] = input.value;
          persist();
        };
        body.append(noteLabel, input);
        detail.append(summary, body);
        list.append(detail);
      }
    }
    filter.onchange = drawCoverage;
    drawCoverage();
    wrap.append(
      btn('← 全部专题', () => openPractice(), 'jump back'),
      panel,
    );
    app.append(wrap);
  }
  function appendSource(parent, card) {
    const ref = card.source || refs[card.id];
    if (!ref) return;
    const a = el('a', '', ref[0] + ' ↗');
    a.href = ref[1];
    a.target = '_blank';
    a.rel = 'noreferrer';
    parent.append(a);
  }
  function question() {
    const s = saved.session;
    if (!s) return home();
    if (s.index >= s.queue.length) return finish();
    if (s.mode === 'mock') return mockQuestion(s);
    const key = s.queue[s.index],
      [c, i] = idParts(key),
      [prompt, answer] = c.steps[i];
    topView();
    const wrap = el('section', 'practice'),
      panel = el('article', 'panel');
    wrap.append(
      btn(
        s.track ? '← 返回本方向' : '← 返回目录',
        () => (s.track ? openPractice('track-' + s.track) : home()),
        'jump back',
      ),
      panel,
    );
    const situation = el('div', 'meta', groupNames[c.group] + ' / ' + c.title),
      progress = el('div', 'rail'),
      fill = el('div', 'fill');
    fill.style.width = (100 * s.index) / s.queue.length + '%';
    progress.append(fill);
    panel.append(
      situation,
      progress,
      el('div', 'meta', s.title + ' · ' + (s.index + 1) + ' / ' + s.queue.length + ' 问'),
      el('h1', '', prompt),
    );
    if (i > 0) {
      const context = el('details', 'context');
      context.append(el('summary', '', '回看本组前置问题'));
      for (const step of c.steps.slice(0, i)) context.append(el('p', '', step[0]));
      panel.append(context);
    }
    const label = el('label', 'note', '先口答，也可以记下思路');
    label.htmlFor = 'draft';
    const input = el('textarea', 'answerbox');
    input.id = 'draft';
    input.value = saved.notes[key] || '';
    input.placeholder = '写下判断、理由或边界用例…';
    input.oninput = () => {
      saved.notes[key] = input.value;
      persist();
    };
    panel.append(label, input);
    const spec = CodingExercises.specs[c.id];
    if (spec && (i === 0 || answer.includes('↵'))) {
      const editor = el('details', 'code-lab'),
        summary = el('summary', '', '现场手写 · 运行 ' + spec.cases.length + ' 个用例');
      const code = el('textarea', 'answerbox code-input');
      code.setAttribute('aria-label', '代码编辑器');
      code.spellcheck = false;
      saved.programs ||= {};
      code.value = saved.programs[c.id] ?? 'function ' + spec.name + '(' + spec.args + ') {\n  \n}';
      code.oninput = () => {
        saved.programs[c.id] = code.value;
        persist();
      };
      const output = el('div', 'result-log');
      output.setAttribute('role', 'status');
      const run = btn('运行用例', () => {
        run.disabled = true;
        output.textContent = '运行中…';
        CodingExercises.run(c.id, code.value, (result) => {
          run.disabled = false;
          output.replaceChildren();
          if (result.error) {
            output.textContent = result.error;
            return;
          }
          for (const row of result.rows)
            output.append(el('p', '', (row.pass ? '通过 · ' : '待修正 · ') + row.label + '　' + row.detail));
        });
      });
      editor.append(summary);
      if (spec.hint) editor.append(el('p', 'meta', spec.hint));
      editor.append(code, run, output);
      panel.append(editor);
    }
    if (!s.reveal) {
      panel.append(
        btn(
          '查看参考答案',
          () => {
            s.reveal = true;
            persist();
            question();
          },
          'btn green',
        ),
      );
    } else {
      const box = el('section', 'answer');
      box.append(el('h2', '', '参考答案'));
      const [explanation, ...code] = answer.split('↵');
      box.append(el('p', '', explanation));
      if (code.length) box.append(el('pre', '', code.join('\n')));
      appendSource(box, c);
      panel.append(box);
      if (i === c.steps.length - 1) panel.append(el('p', 'meta', '整组验收：' + c.check));
      panel.append(el('p', 'grade', '按刚才独立作答的情况自评，然后进入下一问。'));
      const actions = el('div', 'actions');
      for (const [title, grade, style] of [
        ['能独立讲清', 'ok', 'btn green'],
        ['还会卡住', 'weak', 'btn'],
      ]) {
        actions.append(
          btn(
            title,
            () => {
              saved.grades[key] = grade;
              s.round[key] = grade;
              s.index++;
              s.reveal = false;
              persist();
              question();
            },
            style,
          ),
        );
      }
      panel.append(actions);
    }
    app.append(wrap);
  }
  function listWeak() {
    topView();
    const wrap = el('section', 'practice'),
      p = el('article', 'recap'),
      keys = weakKeys();
    wrap.append(
      btn('← 返回目录', () => home(), 'jump back'),
      p,
    );
    p.append(
      el('h1', '', '薄弱题'),
      el(
        'p',
        'muted',
        keys.length
          ? '共 ' + keys.length + ' 问。重练时标记「能独立讲清」，该题会移出列表。'
          : '目前没有标记的薄弱题。作答后选「还会卡住」，就能在这里集中重练。',
      ),
    );
    if (keys.length) {
      p.append(btn('开始重练', () => begin('薄弱题重练', keys), 'btn green'));
      for (const key of keys) {
        const [c, i] = idParts(key);
        p.append(btn(c.steps[i][0], () => begin('单题重练', [key]), 'row'));
      }
    } else p.append(btn('开始 6 题自测', () => begin('考前自测', diagnostics.slice()), 'btn green'));
    app.append(wrap);
  }
  function finish() {
    if (saved.session?.mode === 'mock') return mockReport(saved.session);
    topView();
    const s = saved.session,
      marks = Object.values(s.round),
      weak = Object.keys(s.round).filter((k) => s.round[k] === 'weak');
    const wrap = el('section', 'practice'),
      p = el('article', 'recap');
    wrap.append(p);
    p.append(
      el('div', 'meta', s.title),
      el('h1', '', '本轮复盘'),
      el('p', '', marks.filter((x) => x === 'ok').length + ' 问能独立讲清，' + weak.length + ' 问还会卡住。'),
    );
    if (weak.length) {
      for (const key of weak) {
        const [c, i] = idParts(key);
        p.append(el('p', 'muted', '· ' + c.steps[i][0]));
      }
    }
    const actions = el('div', 'actions');
    if (weak.length) actions.append(btn('重练本轮薄弱题', () => begin('本轮薄弱题', weak), 'btn green'));
    actions.append(btn('返回专题目录', () => home(true)));
    p.append(actions);
    app.append(wrap);
  }
  root.querySelector('#catalog').onclick = () => home(true);
  root.querySelector('#weak').onclick = listWeak;

  function draw(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function startMock(track) {
    let interview;
    if (track) {
      const first = draw(tracks[track].ids);
      interview = [first, draw(tracks[track].ids.filter((id) => id !== first))];
    } else
      interview = [
        draw(['intro', 'star', 'conflict']),
        draw([
          'loop',
          'react',
          'vue',
          'requests',
          ...inGroup('netcases'),
          ...inGroup('security'),
          ...inGroup('ai'),
          ...inGroup('framework-deep'),
          ...inGroup('platform-deep'),
          ...inGroup('runtime-deep'),
          ...inGroup('quality-deep'),
          ...inGroup('resume-data'),
          ...inGroup('resume-ui'),
          ...inGroup('resume-integration'),
        ]),
        draw(['pool', 'debounce', 'window', 'binary', 'lru', ...inGroup('language-deep')]),
        draw([
          'split',
          'merge',
          'parity',
          'rate',
          'control',
          ...inGroup('field'),
          ...inGroup('system-deep'),
          ...inGroup('media-deep'),
        ]),
      ];
    const queue = interview.flatMap((id) => [0, 1, 2].map((i) => id + ':' + i));
    saved.session = {
      title: track ? tracks[track].name + '盲答' : '模拟面试',
      track,
      mode: 'mock',
      queue,
      index: 0,
      round: {},
      replies: {},
      opened: Date.now(),
    };
    persist();
    mockQuestion(saved.session);
  }

  function mockQuestion(s) {
    topView();
    const key = s.queue[s.index];
    const [card, index] = idParts(key);
    const wrap = el('section', 'practice'),
      panel = el('article', 'panel');
    panel.append(
      el('div', 'meta', s.title + ' · 第 ' + (s.index + 1) + ' / ' + s.queue.length + ' 问'),
      el('p', 'meta', groupNames[card.group] + ' / ' + card.title),
      el('h1', '', card.steps[index][0]),
    );
    if (index > 0) panel.append(el('p', 'context', '上一问：' + card.steps[index - 1][0]));
    const label = el('label', 'note', '先独立回答。参考答案会在整场结束后显示。');
    label.htmlFor = 'mock-draft';
    const input = el('textarea', 'answerbox');
    input.id = 'mock-draft';
    input.placeholder = '可以口答，也可以写下你的思路或代码';
    input.value = s.replies[key] || '';
    input.oninput = () => {
      s.replies[key] = input.value;
      persist();
    };
    const advance = () => {
      s.index++;
      persist();
      question();
    };
    panel.append(
      label,
      input,
      btn(s.index + 1 === s.queue.length ? '结束并复盘' : '记录并继续', advance, 'btn green'),
    );
    wrap.append(panel);
    app.append(wrap);
  }

  function mockReport(s) {
    topView();
    const wrap = el('section', 'practice'),
      panel = el('article', 'recap');
    panel.append(el('h1', '', '模拟面试复盘'), el('p', 'meta', '展开每一问，对照自己的回答标记掌握程度。'));
    for (const key of s.queue) {
      const [card, index] = idParts(key),
        [prompt, answer] = card.steps[index];
      const item = el('details', 'topic'),
        detail = el('div', 'mock-detail');
      const summary = el('summary', '', prompt);
      const badge = el('span', '');
      function gradeText() {
        badge.textContent = {ok: '已掌握', weak: '待重练'}[s.round[key]] || '待自评';
      }
      gradeText();
      summary.append(badge);
      detail.append(
        el('p', 'note', '我的回答'),
        el('p', 'user-reply', s.replies[key] || '本题采用口答或未记录文字。'),
        el('p', 'note', '参考答案'),
      );
      const [prose, ...code] = answer.split('↵');
      detail.append(el('p', '', prose));
      if (code.length) detail.append(el('pre', '', code.join('\n')));
      appendSource(detail, card);
      const controls = el('div', 'actions');
      for (const [label, grade] of [
        ['能独立讲清', 'ok'],
        ['还会卡住', 'weak'],
      ]) {
        controls.append(
          btn(label, () => {
            s.round[key] = grade;
            saved.grades[key] = grade;
            persist();
            gradeText();
            weakHeader();
          }),
        );
      }
      detail.append(controls);
      item.append(summary, detail);
      panel.append(item);
    }
    const next = el('div', 'actions');
    next.append(
      btn('重练薄弱题', listWeak, 'btn green'),
      btn('再练一场', () => startMock(s.track)),
    );
    panel.append(next);
    wrap.append(panel);
    app.append(wrap);
  }

  root.querySelector('#back-game').onclick = () => leavePractice();
  return {
    open(route, restoring = false) {
      if (route === 'resume-audit') return showResumeCoverage();
      if (route === 'sources') return showSources();
      if (route === 'weak') return listWeak();
      if (route?.startsWith('track-')) {
        const [track, id] = route.slice(6).split('/');
        if (tracks[track]) {
          if (!tracks[track].ids.includes(id)) return showTrack(track);
          if (
            saved.session?.track === track &&
            saved.session?.title === cards[id].title &&
            (restoring || saved.session.index < saved.session.queue.length)
          )
            return question();
          return cardSession(cards[id], track);
        }
      }
      if (route === 'mock' || (route?.startsWith('mock-') && tracks[route.slice(5)])) {
        const track = route === 'mock' ? undefined : route.slice(5);
        const previous = track ? saved.trackMocks?.[track] : saved.mock;
        if (previous && (restoring || previous.index < previous.queue.length)) {
          saved.session = previous;
          return question();
        }
        return startMock(track);
      }
      if (cards[route]) {
        if (
          saved.session?.title === cards[route].title &&
          (restoring || saved.session.index < saved.session.queue.length)
        )
          return question();
        return cardSession(cards[route]);
      }
      return home();
    },
    weakCount: () => weakKeys().length,
    count: total,
    chains: Object.keys(cards).length,
  };
})();
