'use strict';

const byId = (id) => document.getElementById(id);
LEVELS.splice(
  LEVELS.findIndex((level) => level.id === 9),
  0,
  ...TOPIC_LEVELS,
);
const levelsById = new Map(LEVELS.map((level) => [level.id, level]));
const questionCount = LEVELS.reduce((n, level) => n + level.questions.length, 0);
const storeKey = 'quiz-game.progress.v1';
const topics = {
  0: 'loop',
  1: 'layout',
  2: 'network',
  3: 'vue',
  4: 'react',
  5: 'node',
  6: 'parity',
  7: 'merge',
  8: 'permission',
  9: 'intro',
  10: 'strategy',
  11: 'pool',
  12: 'ts',
  13: 'origin',
  14: 'revoke',
  15: 'window',
  16: 'split',
  17: 'play',
  18: 'track-ai',
  19: 'track-network',
  20: 'track-security',
  21: 'track-language',
  22: 'track-framework',
  23: 'track-platform',
  24: 'track-system',
  25: 'track-runtime',
  26: 'track-media',
  27: 'track-quality',
  28: 'track-resume-data',
  29: 'track-resume-ui',
  30: 'track-resume-integration',
};
let state = {hearts: 5, xp: 0, streak: 0, stars: {}, mistakes: {}, badges: [], run: null, returnTo: 'home'};
try {
  const previous = JSON.parse(localStorage.getItem(storeKey));
  if (previous && previous.stars && previous.mistakes) state = {...state, ...previous};
} catch {}

function save() {
  try {
    localStorage.setItem(storeKey, JSON.stringify(state));
  } catch {
    byId('gameNotice').textContent = '当前浏览器无法保存进度，本次打开期间仍可练习。';
  }
}
function make(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(label, fn, cls = 'tool-button') {
  const button = make('button', cls, label);
  button.type = 'button';
  button.onclick = fn;
  return button;
}
function topicFor(level, q) {
  return q?.chain && PRACTICE_BANK.cards[q.chain] ? q.chain : '';
}
function entryKey(level, index) {
  return level.id + ':' + index;
}
function resolveEntry(key) {
  const [id, index] = key.split(':').map(Number);
  const level = levelsById.get(id);
  return {level, q: level?.questions[index], index};
}
function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function navigate(route) {
  if (location.hash.slice(1) === route) renderRoute();
  else location.hash = route;
}
function startGame() {
  navigate('map');
}
function showHome() {
  navigate('home');
}
function openReview() {
  navigate('review');
}
function openPractice(topic = '') {
  const from = location.hash.slice(1) || 'home';
  if (!from.startsWith('practice')) state.returnTo = from;
  save();
  navigate('practice' + (topic ? '/' + topic : ''));
}
function leavePractice() {
  navigate(state.returnTo || 'home');
}
function updateStats() {
  byId('hearts').textContent = state.hearts;
  byId('xp').textContent = state.xp;
  byId('streak').textContent = state.streak;
}
function renderRoute(restoring = false) {
  const route = location.hash.slice(1) || 'home';
  const inPractice = route === 'practice' || route.startsWith('practice/');
  const inQuiz =
    route === 'quiz' && state.run?.keys.length && !!resolveEntry(state.run.keys[state.run.index] || '').q;
  const onMap = route === 'map' || route === 'victory' || (route === 'quiz' && !inQuiz);
  byId('gameBar').hidden = inPractice;
  byId('startScreen').style.display =
    !inPractice && !onMap && !inQuiz && route !== 'review' ? 'block' : 'none';
  byId('mapContainer').style.display = onMap || inQuiz ? 'block' : 'none';
  byId('reviewPage').hidden = route !== 'review';
  byId('practiceHost').hidden = !inPractice;
  byId('quizOverlay').classList.toggle('active', !!inQuiz);
  byId('victoryOverlay').classList.toggle('active', route === 'victory' && !!state.victory);
  updateStats();
  if (inPractice) Practice.open(route.slice('practice/'.length), restoring);
  else if (inQuiz) renderQuestion();
  else if (route === 'review') renderReview();
  else if (onMap) {
    renderMap();
    if (route === 'victory' && state.victory) renderVictory();
  }
  window.scrollTo(0, 0);
}
function renderMap() {
  const path = byId('mapPath');
  path.replaceChildren();
  if (state.run) {
    const refill = state.run.mode === 'level' && state.hearts === 0;
    path.append(
      action(
        (refill ? '补满生命并继续' : '继续上次作答') +
          ' · ' +
          (state.run.index + 1) +
          ' / ' +
          state.run.keys.length,
        () => {
          if (refill) {
            state.hearts = 5;
            save();
          }
          navigate('quiz');
        },
        'resume-run',
      ),
    );
  }
  for (const [i, level] of LEVELS.entries()) {
    const done = Object.hasOwn(state.stars, level.id);
    const unlocked = i === 0 || Object.hasOwn(state.stars, LEVELS[i - 1].id) || done;
    if (i) path.append(make('div', 'connector' + (done ? ' done' : '')));
    const node = make('div', 'level-node');
    const button = action(
      done ? level.icon : unlocked ? String(i + 1) : '🔒',
      () => startLevel(level.id),
      'level-btn ' + (done ? 'completed' : unlocked ? 'current' : 'locked'),
    );
    button.disabled = !unlocked;
    button.setAttribute('aria-label', (done ? '再练' : unlocked ? '挑战' : '未解锁') + ' ' + level.name);
    if (done) button.append(make('span', 'star-badge', '★ ' + state.stars[level.id]));
    const label = make('div', 'level-label');
    const difficulty = {easy: '入门', medium: '进阶', hard: '困难', boss: 'BOSS'}[level.difficulty];
    label.append(
      make('div', 'name', level.icon + ' ' + level.name),
      make('div', 'desc', level.desc),
      make('div', 'tag tag-' + level.difficulty, difficulty + ' · ' + level.questions.length + '题'),
      action('相关口答练习 →', () => openPractice(topics[level.id]), 'topic-link'),
    );
    node.append(button, label);
    path.append(node);
  }
}
function newRun(keys, mode) {
  state.run = {
    keys,
    index: 0,
    mode,
    order: null,
    pick: null,
    answered: false,
    draft: '',
    combo: 0,
    errors: 0,
  };
  save();
  navigate('quiz');
}
function startLevel(id) {
  const level = levelsById.get(id);
  if (state.hearts <= 0) state.hearts = 5;
  newRun(
    level.questions.map((q, i) => entryKey(level, i)),
    'level',
  );
}
function quitQuiz() {
  navigate(state.run?.mode === 'review' ? 'review' : 'map');
}
function closeVictory() {
  navigate('map');
}
function cleanOption(value) {
  return value.replace(/^[A-D]\)\s*/, '');
}
function optionLabel(q, option) {
  return q.type === 'truefalse' ? (option ? '正确' : '错误') : cleanOption(q.options[option]);
}
function appendExplanation(parent, source) {
  // Only the small formatting vocabulary used in the authored explanations is markup.
  const stack = [parent];
  for (const part of source.split(/(<\/?(?:strong|code)>|<br\s*\/?>)/gi)) {
    const current = stack[stack.length - 1];
    if (/^<(strong|code)>$/i.test(part)) {
      const child = make(part.slice(1, -1));
      current.append(child);
      stack.push(child);
    } else if (/^<\/(strong|code)>$/i.test(part)) {
      if (stack.length > 1) stack.pop();
    } else if (/^<br/i.test(part)) current.append(make('br'));
    else
      current.append(
        document.createTextNode(
          part.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'),
        ),
      );
  }
}
function appendAnswerDetail(parent, detail) {
  if (!detail) return;
  for (const [key, label] of [
    ['principle', '原理与过程'],
    ['example', '例子与推演'],
    ['code', '实现代码'],
    ['pitfalls', '边界与易错点'],
  ]) {
    if (!detail[key]) continue;
    const section = make('section', 'answer-section');
    section.append(make('h3', '', label));
    if (key === 'code') {
      section.append(make('p', 'answer-code-hint', '长代码可左右滚动查看'));
      const pre = make('pre');
      pre.tabIndex = 0;
      pre.setAttribute('aria-label', '参考实现代码');
      pre.append(make('code', '', detail[key]));
      section.append(pre);
    } else section.append(make('p', '', detail[key]));
    parent.append(section);
  }
  if (detail.followups?.length) {
    const section = make('section', 'answer-section');
    section.append(make('h3', '', '继续追问'));
    for (const [question, answer] of detail.followups) {
      const item = make('details', 'answer-followup');
      item.append(make('summary', '', question), make('p', '', answer));
      section.append(item);
    }
    parent.append(section);
  }
  if (detail.sources?.length) {
    const section = make('section', 'answer-section answer-sources');
    section.append(make('h3', '', '核对资料'));
    const list = make('ul');
    for (const [title, href] of detail.sources) {
      let url;
      try {
        url = new URL(href);
      } catch {
        continue;
      }
      if (url.protocol !== 'https:') continue;
      const item = make('li'),
        link = make('a', '', title);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
      list.append(item);
    }
    section.append(list);
    parent.append(section);
  }
}
function renderQuestion() {
  const run = state.run,
    key = run.keys[run.index],
    {level, q} = resolveEntry(key);
  const body = byId('quizBody'),
    footer = byId('quizFooter'),
    check = byId('checkBtn'),
    hint = byId('quizHint');
  body.replaceChildren();
  footer.querySelectorAll('.extra-action').forEach((n) => n.remove());
  byId('progressFill').style.width = ((run.index + (run.answered ? 1 : 0)) / run.keys.length) * 100 + '%';
  body.append(
    make(
      'div',
      'question-type',
      (run.mode === 'review' ? '错题重练' : level.name) +
        ' · 第 ' +
        (run.index + 1) +
        ' / ' +
        run.keys.length +
        ' 题',
    ),
    make('h2', 'question-text', q.q),
  );
  const options = make('div', 'options' + (q.type === 'truefalse' ? ' true-false' : ''));
  if (q.type === 'text') {
    const draft = make('textarea', 'text-input');
    draft.id = 'textAnswer';
    draft.placeholder = '先独立口答，或写下思路，再对照解析';
    draft.setAttribute('aria-label', '我的回答');
    draft.value = run.draft;
    draft.readOnly = run.answered;
    draft.oninput = () => {
      run.draft = draft.value;
      save();
    };
    options.append(draft);
  } else {
    if (!Array.isArray(run.order)) {
      run.order = q.type === 'truefalse' ? [true, false] : shuffle(q.options.map((o, i) => i));
      save();
    }
    run.order.forEach((option, position) => {
      const b = action(
        '',
        () => {
          run.pick = option;
          save();
          for (const other of options.children) other.classList.toggle('selected', other === b);
          check.disabled = false;
        },
        'option-btn',
      );
      b.append(
        make(
          'span',
          'opt-key',
          q.type === 'truefalse' ? (option ? '✓' : '✗') : String.fromCharCode(65 + position),
        ),
        make('span', '', optionLabel(q, option)),
      );
      b.classList.toggle('selected', run.pick === option);
      if (run.answered) {
        b.disabled = true;
        b.classList.toggle('correct', option === q.answer);
        b.classList.toggle('wrong', option === run.pick && option !== q.answer);
      }
      options.append(b);
    });
  }
  body.append(options);
  check.disabled = !run.answered && q.type !== 'text' && run.pick === null;
  if (!run.answered) {
    hint.textContent = q.type === 'text' ? '可口答或写下要点' : '选择一个答案';
    check.textContent = q.type === 'text' ? '查看参考答案' : '确认';
    check.onclick = gradeAnswer;
    return;
  }
  const correct = q.type === 'text' || run.pick === q.answer;
  const feedback = make('section', 'feedback show ' + (correct ? 'correct' : 'wrong'));
  feedback.id = 'feedback';
  feedback.append(
    make('div', 'result-icon', q.type === 'text' ? '参考思路' : correct ? '答对了' : '答错了 · 已加入错题本'),
  );
  const explanation = make('div', 'explanation');
  if (!correct) explanation.append(make('strong', '', '正确答案：' + optionLabel(q, q.answer)), make('br'));
  if (q.detail) explanation.append(make('h3', 'answer-heading', '直接回答'));
  appendExplanation(explanation, q.explain);
  appendAnswerDetail(explanation, q.detail);
  const related = topicFor(level, q);
  feedback.append(
    explanation,
    action(
      related ? '相关追问：' + PRACTICE_BANK.cards[related].title + ' →' : '进入专项口答目录 →',
      () => openPractice(related),
      'topic-link',
    ),
  );
  body.append(feedback);
  hint.textContent = '';
  check.disabled = false;
  if (q.type === 'text') {
    footer.insertBefore(
      action(
        '还需练习',
        () => {
          recordText(true);
        },
        'tool-button extra-action',
      ),
      check,
    );
    check.textContent = '能讲清 · 继续';
    check.onclick = () => recordText(false);
  } else {
    check.textContent = run.index + 1 === run.keys.length ? '完成本轮' : '下一题';
    check.onclick = nextQuestion;
  }
}
function recordText(weak) {
  const key = state.run.keys[state.run.index];
  if (weak) state.mistakes[key] = true;
  else delete state.mistakes[key];
  nextQuestion();
}
function gradeAnswer() {
  const run = state.run;
  if (!run || run.answered) return;
  const key = run.keys[run.index],
    {level, q} = resolveEntry(key);
  if (q.type !== 'text' && run.pick === null) return;
  run.answered = true;
  if (q.type !== 'text') {
    const correct = run.pick === q.answer;
    if (correct) delete state.mistakes[key];
    else state.mistakes[key] = true;
    if (!correct) run.errors++;
    if (run.mode === 'level') {
      if (correct) {
        run.combo++;
        state.streak++;
        state.xp +=
          {easy: 10, medium: 15, hard: 20, boss: 30}[level.difficulty] + (run.combo > 1 ? run.combo * 5 : 0);
      } else {
        run.combo = 0;
        state.streak = 0;
        state.hearts = Math.max(0, state.hearts - 1);
      }
      checkBadges();
    }
  }
  save();
  updateStats();
  renderQuestion();
}
function nextQuestion() {
  const run = state.run;
  if (!run?.answered) return;
  run.index++;
  run.pick = null;
  run.order = null;
  run.draft = '';
  run.answered = false;
  if (run.index >= run.keys.length) {
    const {level} = resolveEntry(run.keys[0]);
    const review = run.mode === 'review',
      stars = run.errors === 0 ? 3 : run.errors <= 2 ? 2 : 1;
    const reward = review ? 0 : {easy: 50, medium: 80, hard: 120, boss: 200}[level.difficulty];
    if (!review) {
      state.stars[level.id] = Math.max(state.stars[level.id] || 0, stars);
      state.xp += reward;
    }
    state.victory = {name: review ? '错题重练完成' : level.name + ' 通关', stars, reward, review};
    checkBadges();
    state.run = null;
    save();
    navigate('victory');
    return;
  }
  save();
  if (run.mode === 'level' && state.hearts === 0) {
    navigate('map');
    return;
  }
  renderQuestion();
  document.querySelector('.quiz-card').scrollTop = 0;
}
function renderVictory() {
  const v = state.victory;
  byId('victoryTitle').textContent = v.name;
  byId('victorySubtitle').textContent = v.review
    ? '可以在错题本查看仍需复习的题目。'
    : '本关成绩已保存，可在地图重练或继续专项追问。';
  byId('rewardXp').textContent = '+' + v.reward;
  byId('rewardStars').textContent = v.review ? '—' : v.stars + ' / 3';
}
function renderReview() {
  const page = byId('reviewPage');
  const keys = Object.keys(state.mistakes).filter((key) => resolveEntry(key).q);
  page.replaceChildren(action('← 返回首页', showHome), make('h1', '', '复习错题'));
  page.append(action('口答薄弱题 · ' + Practice.weakCount() + ' 问', () => openPractice('weak')));
  page.append(make('h2', '', '闯关错题 · ' + keys.length + ' 道'));
  if (!keys.length) {
    page.append(make('p', '', '闯关中答错或标记「还需练习」的题目会出现在这里。'));
    return;
  }
  page.append(action('开始错题重练', () => newRun(keys, 'review'), 'btn btn-primary'));
  for (const key of keys) {
    const {level, q} = resolveEntry(key);
    page.append(action(level.name + ' · ' + q.q, () => newRun([key], 'review'), 'review-item'));
  }
}
let toastTimer = 0;
function checkBadges() {
  const complete = Object.keys(state.stars).length;
  const badges = [
    ['first', state.xp > 0, '获得第一笔经验值'],
    ['combo3', state.run?.combo >= 3, '连续答对三题'],
    ['level3', complete >= 3, '已完成三个关卡'],
    ['all', complete === LEVELS.length, '完成全部关卡'],
    ['xp500', state.xp >= 500, '累计 500 XP'],
  ];
  for (const [id, ok, label] of badges) {
    if (!ok || state.badges.includes(id)) continue;
    state.badges.push(id);
    byId('achievementText').textContent = label;
    byId('achievementToast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => byId('achievementToast').classList.remove('show'), 2200);
  }
}
byId('homeCount').textContent =
  LEVELS.length + ' 个关卡 · ' + questionCount + ' 道闯关题 · ' + Practice.count + ' 问专项口答';
window.addEventListener('hashchange', () => renderRoute());
renderRoute(true);
