'use strict';

{
  const group = 'framework-deep';
  const cards = [
    {
      id: 'frame-effect',
      title: '筛选结果和下单请求都放进 Effect，会发生什么',
      source: [
        'React · You Might Not Need an Effect',
        'https://react.dev/learn/you-might-not-need-an-effect',
      ],
      check: '能辨认派生状态、用户事件和外部同步，并用一次重挂验证副作用。',
      steps: [
        [
          '组件接收 products 和 keyword，用 Effect 过滤后 setVisibleProducts。这增加了什么状态风险？',
          '过滤结果能从当前输入计算。额外保存一份会出现先渲染旧结果、Effect 再更新的过程，也让输入与派生状态可能失配。先在渲染时计算，确有计算开销再依据测量使用缓存。',
        ],
        [
          '下单按钮先 setSubmitted(true)，Effect 发现为 true 就发订单请求，为什么难维护？',
          '请求的原因是这次用户提交。放在事件处理流程能明确使用哪次输入并处理结果；从渲染后的状态间接推导动作，重挂和状态恢复更容易触发额外执行。写接口仍需服务端幂等。',
        ],
        [
          '那订阅外部聊天房间又为什么适合 Effect？',
          '订阅需要随当前房间和连接参数保持同步，离开时解除。依赖变化先清理旧连接再建立新连接，确保每次 setup 都有对应 cleanup。',
        ],
        [
          '如何验证重构没有破坏业务，又确实消除了多余工作？',
          '用同一输入断言过滤结果，检查一次用户点击只启动一次提交流程；再做挂载、卸载、重挂与房间切换，观察活动订阅数量和旧回调。通过 Profiler 比较多余提交。',
        ],
      ],
    },
    {
      id: 'frame-transition',
      title: '搜索框流畅了，为什么请求数和计算耗时没下降',
      source: ['React · useDeferredValue', 'https://react.dev/reference/react/useDeferredValue'],
      check: '能分别解释紧急输入、延后渲染、请求频率和同步计算的处理位置。',
      steps: [
        [
          '搜索框下面有昂贵列表。如何让当前输入立即显示，列表稍后跟上？',
          "输入框绑定即时 query；把 useDeferredValue(query) 交给 memo 包装的昂贵列表。query 变化时 deferredQuery 暂时仍是旧值，且其他 props 引用稳定，列表可以跳过紧急渲染，之后再用新查询渲染。用 query !== deferredQuery 显示旧结果状态；它没有固定等待时长，也不等于请求防抖。下面把 SlowList 当作已实现的昂贵列表组件。↵import { memo, useDeferredValue, useState } from 'react';↵const DeferredList = memo(SlowList);↵function Search({ items }) {↵  const [query, setQuery] = useState('');↵  const deferredQuery = useDeferredValue(query);↵  const stale = query !== deferredQuery;↵  return <>↵    <input value={query} onChange={e => setQuery(e.target.value)} />↵    <section aria-busy={stale}>↵      {stale && <p>正在更新结果</p>}↵      <DeferredList items={items} query={deferredQuery} />↵    </section>↵  </>;↵}",
        ],
        [
          '使用 deferred value 后，每输入一字仍发一次请求，是否说明 Hook 失效？',
          '延后的是部分 UI 更新，它本身不承诺减少网络请求。请求去重、缓存或防抖要另按交互要求设计，也要处理过期响应。',
        ],
        [
          '把一段 300 ms 的同步计算直接放进 startTransition 回调，会自动移出主线程吗？',
          '该回调里的普通同步计算仍会执行并占用线程。先将可延后的内容表达为渲染更新；对单个重计算评估分块、预计算或 Worker，避免把调度优先级当作计算隔离。',
        ],
        [
          '怎样判断优化起作用，且没有让用户误操作旧结果？',
          '比较按键到显示的时延、列表最终更新耗时和请求数。快速输入后点击旧列表时，应按产品要求禁用相关动作或明确绑定旧查询，测试结果与查询身份一致。',
        ],
      ],
    },
    {
      id: 'frame-external',
      title: '外部 Store 没变，组件为什么不断重渲染',
      source: ['React · useSyncExternalStore', 'https://react.dev/reference/react/useSyncExternalStore'],
      check: '能规定 snapshot 的身份与订阅生命周期，并设计服务端初值一致性检查。',
      steps: [
        [
          'getSnapshot 每次返回 { items: store.items }，为什么可能出现重复更新？',
          'React 通过 Object.is 比较快照。每次都返回新包装对象，会使“底层没变”的两次读取也被识别成不同状态，可能触发持续重渲染及快照缓存警告。底层没变时返回同一不可变快照，变化时替换快照并通知订阅者；也不能原地修改旧快照。以下计数 Store 展示读取、变更和退订的最小闭环，可将其 subscribe/getSnapshot 传给 useSyncExternalStore。↵function createCounterStore() {↵  let snapshot = Object.freeze({ count: 0 });↵  const listeners = new Set();↵  return {↵    getSnapshot: () => snapshot,↵    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },↵    increment() {↵      snapshot = Object.freeze({ count: snapshot.count + 1 });↵      for (const fn of [...listeners]) fn();↵    }↵  };↵}',
        ],
        [
          'subscribe 写在组件内部，每次都创建新函数，会有什么额外工作？',
          'React 接收到不同订阅函数时会重新订阅。将稳定的订阅实现放在组件外，或根据真实依赖稳定其身份，同时返回能够解除本次监听的函数。',
        ],
        [
          '为什么仅在 useEffect 里监听 Store，再 setState，不一定适合所有外部源？',
          '订阅建立前后可能发生变化，且并发渲染需要一致的快照读取协议。useSyncExternalStore 为读取和订阅提供专门接口。仍要由 Store 保证快照稳定与变更通知正确。',
        ],
        [
          '该组件也做服务端渲染，怎样安排第一次快照？',
          '提供 getServerSnapshot，并让客户端接管时读到与服务端一致的初始数据。若只能在浏览器读取，应明确客户端渲染边界。测试首次接管和随后 Store 更新各触发的结果。',
        ],
      ],
    },
    {
      id: 'frame-boundary',
      title: '表格被错误边界包住，点击导出还是报错',
      source: [
        'React · Component 与错误边界',
        'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
      ],
      check: '能根据异常发生的位置分配恢复责任，并避免重复执行写操作。',
      steps: [
        [
          '子表格渲染字段时报错，与普通 onClick 导出回调抛错，最近的 Error Boundary 会同样处理吗？',
          "不会。后代在渲染、构造函数和生命周期中抛出的错误由最近的错误边界处理；普通 onClick 运行在事件流程里，不会因为外面有边界就自动显示 fallback。异步导出应在事件回调中 await 并 try/catch，失败后显示可重试错误并在 finally 恢复按钮。fetch 的 HTTP 4xx/5xx 不会自动 reject，还需检查 response.ok。下面是组件内部处理器，setError/setBusy 是组件状态 setter。↵async function onExport() {↵  setBusy(true); setError('');↵  try {↵    const response = await fetch('/api/export');↵    if (!response.ok) throw new Error('导出失败：HTTP ' + response.status);↵    const blob = await response.blob();↵    downloadBlob(blob); // 项目注入的下载函数↵  } catch (e) {↵    setError(e instanceof Error ? e.message : '导出失败');↵  } finally { setBusy(false); }↵}",
        ],
        [
          '给整个页面套 try/catch，为什么捕获不到稍后发生的子组件渲染异常？',
          '返回元素描述后，子组件可能由 React 在另一阶段调用。局部同步 try/catch 没包住那次实际执行；应在组件树中布置有恢复 UI 的错误边界。',
        ],
        [
          '错误边界的备用界面也抛错怎么办？边界应放多细？',
          '边界自身出错要由更上层处理。按用户可独立继续的区域设计边界，例如报表失效时保留筛选和导航；备用界面保持简单，带上能定位版本和区域的错误标识。',
        ],
        [
          '用户点击重试时，怎样避免重新触发一笔已成功的导出收费或其他写操作？',
          '界面重置只负责重建展示状态。涉及写入先查询原业务结果，按稳定请求标识恢复；将自动重渲染与用户明确的业务重试分开实现和测试。',
        ],
      ],
    },
    {
      id: 'frame-suspense',
      title: '外面放了 Suspense，为什么 fetch 时不显示 fallback',
      source: ['React · Suspense', 'https://react.dev/reference/react/Suspense'],
      check: '能列出边界被激活的条件，并设计可独立揭示的加载区域。',
      steps: [
        [
          '组件在 useEffect 里 fetch，外层已经有 Suspense，为什么 fallback 没出现？',
          '普通 Effect 请求不会自动让子树挂起。需要手动维护 loading，或使用框架支持的 Suspense 数据源与加载方式。React.lazy 加载组件代码也是常见的挂起来源。',
        ],
        [
          '详情和推荐分别很慢，但被包在同一个边界，为什么详情完成后仍看不到？',
          '同一边界内的内容按该边界一起揭示。可以围绕用户能独立使用的区域安排嵌套边界，让详情先出现、推荐继续等待。拆分方式应与设计中的加载区域一致。',
        ],
        [
          '已显示的结果在换筛选时又挂起，怎样减少整块内容反复变成骨架屏？',
          '对于适合保留旧内容的更新，可结合 Transition 或 deferred value，并显示更新中的状态。切换到语义上不同的实体时，要考虑重置边界和旧内容，避免继续展示错误对象。',
        ],
        [
          '怎样验证 loading、失败和成功三种状态没有互相覆盖？',
          '控制代码或数据源的完成时序，分别测试初次慢加载、再次更新和拒绝。核对每个区域的等待反馈，以及错误边界如何处理失败；不能把所有错误都持续显示成加载中。',
        ],
      ],
    },
    {
      id: 'frame-input',
      title: '输入框偶尔变只读，光标也会跳动',
      source: ['React · input', 'https://react.dev/reference/react-dom/components/input'],
      check: '能解释 value 的所有者，并验证输入、回显和编辑过程中状态不会跳变。',
      steps: [
        [
          '输入框传 value={name}，输入时却恢复成旧值，首先查什么？',
          '核对 onChange 是否及时把事件中的当前值写入对应状态。受控输入的显示由 value 决定，未更新会被旧值覆盖。若整个组件随输入重新挂载，也会影响焦点与选区。',
        ],
        [
          '接口回来前 name 是 undefined，后来变成字符串，为什么有警告？',
          '组件从未受控切换成了受控。若按受控设计，从初始化开始提供字符串，例如空字符串，异步回填也要避免覆盖用户已经编辑的草稿。',
        ],
        [
          'defaultValue 与 value 都能提供初始文字，区别在哪里？',
          'defaultValue 设置未受控输入的初始值，后续编辑由 DOM 保存；value 是当前渲染持续提供的值。外部需要随记录切换重设输入时，要先明确重置规则和草稿归属。',
        ],
        [
          '用户输入到一半后台刷新了同一记录，怎样保留编辑意图？',
          '记录服务端版本与草稿是否修改。刷新可更新参考数据，覆盖草稿前要解决版本冲突或请求确认。测试慢回填、切换记录、清空字段和失去焦点后的提交。',
        ],
      ],
    },
    {
      id: 'frame-watch',
      title: 'watchEffect 的异步后半段为什么没有重新执行',
      source: ['Vue · Watchers', 'https://vuejs.org/guide/essentials/watchers.html'],
      check: '能指出依赖采集时段、清理注册时机和 DOM 读取的调度选择。',
      steps: [
        [
          'watchEffect(async () => { await ready(); use(id.value) }) 中，修改 id 为什么未必触发再次执行？',
          'watchEffect 自动跟踪同步执行阶段访问的响应式依赖。首次 await 之后才读取 id 时，不能据此建立预期订阅。把依赖读取放到同步阶段，或用 watch 明确声明源。',
        ],
        [
          'watch(id, ...) 发起请求，如何在 id 变化时处理旧请求？',
          '创建取消控制器并注册清理，旧监听失效时取消或忽略结果。Vue 3.5+ 的 onWatcherCleanup 要在同步阶段调用；回调提供的 onCleanup 也可使用，按所用版本核对接口。',
        ],
        [
          '监听回调里测量自己组件的 DOM，读到旧尺寸时怎样处理？',
          '默认回调可能发生在所属组件的 DOM 更新前。确需更新后测量时选择 flush: post，并确认后续图片或字体加载是否还会改变尺寸。',
        ],
        [
          '在 setTimeout 内新建的 watcher，会自动随组件卸载停止吗？',
          '异步创建的 watcher 可能没有绑定到所属组件，需保存停止句柄并清理。优先在 setup 同步创建、通过条件控制执行，再测卸载后是否仍请求或写状态。',
        ],
      ],
    },
    {
      id: 'frame-keepalive',
      title: '切走缓存页面后，轮询为什么仍在跑',
      source: ['Vue · KeepAlive', 'https://vuejs.org/guide/built-ins/keep-alive.html'],
      check: '能区分失活与销毁，并按缓存策略处理订阅和数据新鲜度。',
      steps: [
        [
          '页面放进 KeepAlive，切到别页后卸载钩子没触发，原因是什么？',
          '组件实例可能进入失活并被缓存，之后再次激活继续使用。切出时应处理 deactivated，返回时处理 activated；最终被缓存淘汰或销毁时才进入相应销毁流程。',
        ],
        [
          '隐藏页面的轮询应如何暂停，返回时又如何避免重复启动？',
          '把轮询句柄和是否运行集中管理，激活时仅启动一份，失活或销毁时停止。不要让多条生命周期路径各自无条件创建定时器，验收时统计活跃订阅数量。',
        ],
        [
          '缓存保留了搜索表单，但远端权限已变化，返回页面怎样刷新？',
          '表单草稿和远端权威状态各有时效。激活时根据资源版本或期限刷新权限与数据，保留草稿，提交前再次由服务端校验；缓存实例不能代表业务状态永久有效。',
        ],
        [
          '配置 max=3，依次访问四个页面，怎样解释第四次之后的行为？',
          '达到上限后，KeepAlive 会按最近使用策略淘汰缓存实例。测试重新访问被淘汰页时的初始化、草稿恢复与资源释放，并检查 include/exclude 是否匹配实际组件名。',
        ],
      ],
    },
    {
      id: 'frame-store',
      title: '从 Pinia 解构 count 后，为什么页面不再跟着变',
      source: ['Pinia · Defining a Store', 'https://pinia.vuejs.org/core-concepts/'],
      check: '能区分状态、getter 和 action 的提取方式，并为共享状态指定清理边界。',
      steps: [
        [
          'const { count } = store 与 const { count } = storeToRefs(store) 有什么差别？',
          '直接取出数值会留下当时的值。storeToRefs 为状态和 getter 提供持续关联的 ref，模板或代码按对应方式读取；也可保持 store.count 的访问路径。',
        ],
        [
          '那 action 也必须通过 storeToRefs 提取吗？',
          'Action 是可调用方法，通常可以直接从 store 解构；storeToRefs 针对响应式属性并会跳过 action。应明确拿到的是 ref、计算属性还是函数，避免统一套一种提取方式。',
        ],
        [
          '一个编辑弹窗的临时输入，是否都应该放入全局 Store？',
          '先确定谁需要共享以及保存多久。仅弹窗使用的草稿可局部保存，跨路由续写才需要提升所有权。放入共享 Store 后，必须设计关闭、提交、换账号和换记录时的清理。',
        ],
        [
          '如何验证 Store 改造没有让两个页面互相覆盖草稿？',
          '用不同记录 ID 同时打开编辑，交错修改与关闭，再切换账号。断言草稿按规定范围隔离，提交动作读取对应记录，订阅在页面退出时停止。',
        ],
      ],
    },
    {
      id: 'frame-route',
      title: '从用户 A 切到 B，详情页为什么还保留 A 的数据',
      source: [
        'Vue Router · Composition API',
        'https://router.vuejs.org/guide/advanced/composition-api.html',
      ],
      check: '能把路由参数、请求身份和本地草稿绑定，并解释后退时的恢复规则。',
      steps: [
        [
          '同一路由组件从 /users/A 切换到 /users/B，只在 mounted 请求一次会有什么问题？',
          '组件可能被复用，挂载阶段不会为每次参数变化重复执行。监听实际改变数据集的参数或使用路由更新守卫，并确保初次进入也加载。',
        ],
        [
          '直接深度 watch 整个 route，为什么容易出现额外请求？',
          '查询参数、哈希等无关变化也可能触发逻辑。显式监听影响详情的 ID，列表页则把真实筛选、排序和分页作为查询身份，避免遗漏或扩大依赖。',
        ],
        [
          'A 的请求在切到 B 后才返回，需要做哪两件事？',
          "同时做“停止旧工作”和“拒绝旧提交”：旧监听失效时 abort；每次加载捕获自己的请求代际，成功、catch 和 finally 都只有当前代际才能回写。仅比较 ID 不够，因为 A→B→A 时第一个 A 仍可能迟到。以下片段放在 Vue setup 中，且让新请求开始时清空旧数据显示明确加载态；草稿另按资源 ID 保存。↵import { ref, watch } from 'vue';↵import { useRoute } from 'vue-router';↵const route = useRoute();↵const user = ref(null), error = ref(''), loading = ref(false);↵let generation = 0;↵watch(() => route.params.id, async (id, _, onCleanup) => {↵  const mine = ++generation;↵  const controller = new AbortController();↵  let active = true;↵  onCleanup(() => { active = false; controller.abort(); });↵  user.value = null; error.value = ''; loading.value = true;↵  const current = () => active && mine === generation && id === route.params.id;↵  try {↵    const r = await fetch('/api/users/' + encodeURIComponent(String(id)), { signal: controller.signal });↵    if (!r.ok) throw new Error('HTTP ' + r.status);↵    const result = await r.json();↵    if (current()) user.value = result;↵  } catch (e) {↵    if (current() && e.name !== 'AbortError') error.value = e.message;↵  } finally { if (current()) loading.value = false; }↵}, { immediate: true });",
        ],
        [
          '用户在 B 留了草稿，然后浏览器后退到 A，怎么设计状态恢复？',
          '用稳定资源 ID 管理草稿，选择将可分享筛选放 URL，临时编辑保留在约定范围。通过前进、后退、刷新和未保存离开四种入口验证，不能只测试页面内按钮。',
        ],
      ],
    },
  ];
  PRACTICE_BANK.groups.push({id: group, name: 'React / Vue 高阶追问', cards: cards.map((card) => card.id)});
  for (const card of cards) PRACTICE_BANK.cards[card.id] = {...card, group};
  TOPIC_LEVELS.push({
    id: 22,
    name: '框架高阶实践',
    desc: '同步、并发渲染、缓存与状态归属',
    icon: '🧩',
    difficulty: 'hard',
    questions: [
      {
        type: 'choice',
        chain: 'frame-effect',
        q: '商品过滤结果完全由 products 和 keyword 决定，优先怎样组织状态？',
        options: [
          '每次渲染后用 Effect 复制结果到另一份 state',
          '在渲染时派生结果，实测计算昂贵时再考虑缓存',
          '把派生结果存 localStorage 并忽略输入变化',
          '让每个子组件保存自己的结果副本',
        ],
        answer: 1,
        explain:
          '直接在渲染时计算 visible = products.filter(...)，使结果始终对应这次 props/state。把它另存 state 再用 Effect 同步，会先提交旧结果、再额外提交新结果，还增加遗漏依赖的风险。实测过滤昂贵时用 useMemo 缓存纯计算，依赖必须包括 products 与 keyword；缓存不是正确性的前提。',
        detail: {
          example:
            '把 filter 结果另存一份 state、再用 Effect 同步，会先渲染一次旧结果，Effect 跑完再渲染新结果——用户能看到一闪而过的错误列表，还多了一次提交。直接 const visible = products.filter(...) 写在渲染里，结果永远对应这一次的输入，不需要同步，也不会有遗漏依赖的问题。真要缓存，等实测出瓶颈再加 useMemo。',
          code:
            '// 渲染时派生，无需同步\nconst visible = products.filter((p) => p.name.includes(keyword));\n\n// 实测昂贵时再缓存，依赖必须完整\nconst visible = useMemo(\n  () => products.filter((p) => p.name.includes(keyword)),\n  [products, keyword],\n);',
          pitfalls:
            '派生状态另存一份，几乎是所有“显示和输入不同步”的来源。Effect 里少写一个依赖，结果就停在旧值上。useMemo 不是正确性工具，依赖写漏照样出错，先保证渲染时计算正确再谈缓存。写请求放进 Effect 更危险，重挂和状态恢复都可能重复触发。',
        },
      },
      {
        type: 'truefalse',
        chain: 'frame-transition',
        q: '使用 useDeferredValue 后，可以据此认定搜索接口请求次数一定会减少。',
        answer: false,
        explain:
          '错误。useDeferredValue 让部分渲染使用稍旧的值，优先让输入反馈完成，没有固定延迟也不承诺合并网络请求。若每次 query 变化都发 fetch，请求数仍可能相同。按产品要求在请求层做防抖、缓存或去重，并用请求身份阻止旧结果覆盖新结果。',
        detail: {
          example:
            '输入框绑即时 query，让用户每次按键都立刻看到字符；把 useDeferredValue(query) 交给 memo 包装的昂贵列表，列表可以晚一步再用新值渲染。这个过程只改善“打字卡不卡”，如果每次 query 变化都照发一条 fetch，请求次数一个都不会少——那是请求层的事，得单独做防抖或去重。',
          code:
            'const [query, setQuery] = useState(\'\');\nconst deferredQuery = useDeferredValue(query);\nconst stale = query !== deferredQuery;   // 用来显示"更新中"\n\n<DeferredList query={deferredQuery} />   // 昂贵列表可被延后',
          pitfalls:
            '把 useDeferredValue 当成防抖，是最常见的误读，它没有固定延迟也不合并请求。以为 startTransition 能把同步计算移到别的线程也不对，回调里的同步代码照样占主线程。快速输入后点了旧列表上的按钮，要明确绑定的是旧查询还是禁用操作，否则用户操作的就是过期结果。',
        },
      },
      {
        type: 'choice',
        chain: 'frame-external',
        q: '外部 Store 没变时，getSnapshot 应遵循哪一项约定？',
        options: [
          '每次返回新对象来证明已读取',
          '返回随后会被原地修改的同一对象',
          '返回缓存的不可变快照，变更后再更新引用',
          '返回一个每次重新创建的 Promise',
        ],
        answer: 2,
        explain:
          '未改变时返回同一份不可变快照，改变时创建新快照并通知订阅者。React 用 Object.is 比较；每次重新包装对象会被视为变化，原地修改同一对象又可能漏掉变化。getSnapshot 应只读取状态，不应在读取时顺手修改 Store。',
        detail: {
          example:
            'getSnapshot 每次返回 { items: store.items }，底层数据一点没变，React 用 Object.is 比较两次结果却发现是新对象，于是认为状态变了，持续重渲染甚至报快照缓存警告。正确做法是：没变就返回同一份冻结快照，真变了才建新对象并通知订阅者。',
          code:
            'function createCounterStore() {\n  let snapshot = Object.freeze({ count: 0 });\n  const listeners = new Set();\n  return {\n    getSnapshot: () => snapshot,\n    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },\n    increment() {\n      snapshot = Object.freeze({ count: snapshot.count + 1 });  // 换引用\n      for (const fn of [...listeners]) fn();\n    },\n  };\n}',
          pitfalls:
            '每次新建包装对象会让“没变”被判成“变了”。反过来原地修改同一对象，引用没变，订阅者收不到更新。subscribe 写在组件内部每次都是新函数，会导致反复重订阅。getSnapshot 里顺手改状态更糟，读取动作产生了副作用。服务端渲染还要单独提供 getServerSnapshot。',
        },
      },
      {
        type: 'choice',
        chain: 'frame-boundary',
        q: '普通按钮 onClick 中导出请求失败，如何提供正确的错误反馈？',
        options: [
          '在事件异步流程中处理错误，更新可恢复的失败状态',
          '只要父组件有 Error Boundary 就会自动处理',
          '用 Vue 的 onErrorCaptured 处理 React 事件',
          '把失败永久显示成 loading',
        ],
        answer: 0,
        explain:
          '在 async onClick 中 await 导出请求，用 try/catch 更新错误提示，finally 恢复按钮；使用 fetch 还需检查 response.ok，HTTP 500 不会自动 reject。Error Boundary 处理后代渲染等 React 管理阶段，不能代替普通事件或 Promise 的错误处理。重试前区分只读导出与可能已执行的写操作。',
        detail: {
          example:
            '表格外层包了 Error Boundary，点导出却还是只在控制台报错、界面没反应。因为 onClick 跑在事件流程里，不经过 Error Boundary 处理的那些渲染阶段。要自己在事件里 await、try/catch、把失败写进可重试的错误状态，finally 里恢复按钮。另外 fetch 遇到 HTTP 500 不会自动 reject，必须手动检查 response.ok。',
          code:
            'async function onExport() {\n  setBusy(true); setError(\'\');\n  try {\n    const res = await fetch(\'/api/export\');\n    if (!res.ok) throw new Error(\'HTTP \' + res.status);   // 5xx 不会自动 reject\n    downloadBlob(await res.blob());\n  } catch (e) {\n    setError(e.message);\n  } finally {\n    setBusy(false);\n  }\n}',
          pitfalls:
            '以为有 Error Boundary 就一劳永逸，是这里最典型的误解，它只管渲染和生命周期里的错误。给整页套 try/catch 也接不住稍后发生的子组件渲染异常，那时代码已经跑出去了。把失败一直显示成 loading，用户既不知道失败也等不到结果。重试前要分清只读导出和可能已执行成功的写操作，后者必须先查原结果。',
        },
      },
      {
        type: 'truefalse',
        chain: 'frame-suspense',
        q: '子组件在普通 useEffect 中执行 fetch，会自动激活父级 Suspense 的 fallback。',
        answer: false,
        explain:
          '错误。普通 Effect 在提交后执行，其中的 fetch 不会自动告诉 Suspense 当前渲染正在挂起。此路径需自己维护 loading/error，或使用明确支持 Suspense 的数据框架；React.lazy 加载组件代码也是常见的挂起来源。把任意请求包在 Suspense 外面不会自动接管其状态。',
        detail: {
          example:
            '外层已经包了 Suspense，子组件在 useEffect 里 fetch，fallback 却从不出现。因为普通 Effect 在提交之后才跑，那时渲染早已完成，没有人告诉 Suspense“我正在挂起”。Suspense 真正的挂起来源是 React.lazy 加载组件代码，或明确支持 Suspense 的数据框架；普通请求得自己维护 loading 和 error。',
          pitfalls:
            '以为包上 Suspense 就能自动接管所有请求，是最常见的错位。同一个边界里的详情和推荐会一起揭示，快的那个也得等慢的，要按设计拆成嵌套边界。换筛选时整块变骨架屏，是没配合 Transition 或 deferred value。把失败一直显示成 loading，是最难排查的状态覆盖。',
        },
      },
      {
        type: 'choice',
        chain: 'frame-watch',
        q: 'watchEffect 中某个 ref 只在首次 await 之后读取，该 ref 改变时为何可能没有重新执行？',
        options: [
          'ref 在异步函数中会变成普通变量',
          'Vue 停止支持异步监听',
          '所有依赖只能由 deep: true 收集',
          '自动依赖跟踪只覆盖同步执行阶段的读取',
        ],
        answer: 3,
        explain:
          'watchEffect 只跟踪同步执行期间读取的响应式依赖；首次 await 后才读取的 ref 不在这次自动收集范围内。可在 await 前读取所需值，或用 watch(() => id.value, ...) 显式声明依赖。异步任务变化时还要清理旧请求，并防止迟到结果回写。',
        detail: {
          example:
            'watchEffect(async () => { await ready(); use(id.value); }) 里，id 是在 await 之后才读的。自动依赖收集只发生在副作用同步执行的那一段，await 之后已经出了收集窗口，所以 id 变了不会触发重跑。改法要么在 await 之前先把 id.value 读出来，要么用 watch(() => id.value, ...) 把依赖写明白。',
          code:
            '// 不会被追踪：id 在 await 之后才读取\nwatchEffect(async () => { await ready(); use(id.value); });\n\n// 显式声明依赖，并清理旧请求\nwatch(() => id.value, async (id, _, onCleanup) => {\n  const c = new AbortController();\n  onCleanup(() => c.abort());\n  use(id, { signal: c.signal });\n}, { immediate: true });',
          pitfalls:
            '“异步监听不受支持”是误读，异步回调能用，只是依赖收集在 await 处中断。deep: true 解决的是嵌套属性，和这里无关。回调里发请求却不清理，id 快速变化时会有一串旧请求回来覆盖新结果。在 setTimeout 里新建的 watcher 可能没绑到组件，卸载后仍在跑。',
        },
      },
      {
        type: 'choice',
        chain: 'frame-keepalive',
        q: '缓存页面切走后希望暂停轮询，优先把暂停逻辑接在哪个生命周期？',
        options: [
          '只在 mounted 中清理',
          'deactivated，并保留最终销毁的清理',
          '每次 render 时创建新轮询',
          '等待浏览器关闭才处理',
        ],
        answer: 1,
        explain:
          '在 onDeactivated 中清除轮询，在 onActivated 中按需要恢复，并在最终卸载时清理。缓存切走通常只是失活，实例没有卸载，所以仅用 onUnmounted 会继续后台轮询。启动函数应先清旧定时器，避免多次激活叠加；失活还要取消或忽略正在执行的旧请求。',
        detail: {
          example:
            '页面放进 KeepAlive，切到别的页后组件没卸载、只是失活，所以 onUnmounted 根本没执行，轮询还在后台跑。要在 onDeactivated 里清掉定时器、onActivated 里恢复，同时保留最终卸载的清理。启动函数必须先清旧定时器，否则来回切几次就会叠出好几个轮询并发。',
          code:
            'let timer = 0;\nfunction start() { stop(); timer = setInterval(poll, 30000); }\nfunction stop() { clearInterval(timer); timer = 0; }\n\nonActivated(start);\nonDeactivated(stop);\nonUnmounted(stop);   // 最终销毁也要清理',
          pitfalls:
            '只写 onUnmounted 是这里最典型的遗漏，缓存场景下它几乎不会触发。每次 render 创建轮询会让数量失控。失活时还要取消或忽略在途请求，否则旧响应回来后仍会写状态。KeepAlive 有 max 上限，超出后实例会被淘汰，重新访问时是全新初始化，草稿恢复要单独设计。',
        },
      },
      {
        type: 'text',
        chain: 'frame-route',
        q: '详情组件从 A 复用到 B，A 的慢请求随后才返回。请描述结果、错误和 loading 如何避免串到 B。',
        explain:
          '监听 route.params.id 并 immediate 加载；每次请求记录递增代际与资源 ID，监听清理时 abort 旧请求。成功时仅当前代际写 data，catch 仅当前代际写 error，finally 也仅当前代际置 loading=false。只比 ID 不够覆盖 A→B→A；卸载时使当前任务失效。新页面明确显示加载态，草稿按资源 ID 独立存储。',
        detail: {
          example:
            '同一个路由组件从 /users/A 切到 /users/B，实例被复用、mounted 不会再跑，所以必须监听参数变化并带 immediate 首次加载。A 的请求在切到 B 之后才返回，要答好需要两件事同时做：切走时把旧请求 abort 掉；每次加载记住自己的代际号，结果、错误、loading 三个回写点都只在“我仍是当前代际”时才写。',
          code:
            'let generation = 0;\nwatch(() => route.params.id, async (id, _, onCleanup) => {\n  const mine = ++generation;\n  const c = new AbortController();\n  onCleanup(() => c.abort());\n  user.value = null; loading.value = true;\n  const current = () => mine === generation;\n  try {\n    const r = await fetch(`/api/users/${id}`, { signal: c.signal });\n    if (current()) user.value = await r.json();\n  } catch (e) {\n    if (current() && e.name !== \'AbortError\') error.value = e.message;\n  } finally {\n    if (current()) loading.value = false;\n  }\n}, { immediate: true });',
          pitfalls:
            '只比较 ID 不够，A→B→A 时第一个 A 的结果也能通过 ID 检查。只 abort 不做代际校验，abort 与回写之间仍有窗口。三个回写点漏掉任何一个，都会出现 B 的页面带着 A 的错误或 loading。深度 watch 整个 route 会被 query、hash 等无关变化触发。草稿要按资源 ID 分开存，否则切回去会看到别人的内容。',
        },
      },
    ],
  });
}
