'use strict';
{
  const group = 'runtime-deep';
  const cases = [
    {
      id: 'runtime-microtasks',
      title: '同一段异步代码，从 .cjs 改成 .mjs 后顺序变了',
      source: [
        'Node.js · nextTick 与 queueMicrotask',
        'https://nodejs.org/api/process.html#when-to-use-queuemicrotask-vs-processnexttick',
      ],
      check: '能分别预测两种模块的顶层输出，说明嵌套调度时不能机械套用优先级口诀。',
      steps: [
        [
          "在文件顶层依次执行 console.log('S'); Promise.resolve().then(() => console.log('P')); queueMicrotask(() => console.log('Q')); process.nextTick(() => console.log('N')); 分别作为 .cjs 和 .mjs 入口运行，会输出什么？",
          '在现代 Node 的该顶层示例中，.cjs 为 S、N、P、Q；.mjs 为 S、P、Q、N。ESM 的求值本身处于微任务执行过程，不能把 CommonJS 顶层的 nextTick 顺序当作所有执行上下文的规则。应标明版本与模块格式。',
        ],
        [
          '如果 Promise 回调里又安排 nextTick 和另一个 Promise 回调，还能直接回答 nextTick 永远先执行吗？',
          '不能。当前已经在清空 Promise 微任务队列时，新安排的 nextTick 不会插队打断它。下面在现代 Node 独立文件中输出 P1、P2、N：P1 回调安排 N 和 P2，P2 仍属于正在处理的微任务队列，清空后才处理新 nextTick。应说明版本与执行位置，不要套用“nextTick 永远优先”。↵Promise.resolve().then(() => {\n  console.log("P1");\n  process.nextTick(() => console.log("N"));\n  Promise.resolve().then(() => console.log("P2"));\n});',
        ],
        [
          '递归调用 queueMicrotask 分批计算，为什么 HTTP 请求仍然迟迟没有回调？',
          '每次处理又补入微任务会让队列持续非空，事件循环难以推进到 I/O。计算分批应在批次间真正让出执行机会，例如 setImmediate；CPU 重任务还要限制输入和并发，再考虑 Worker。',
        ],
        [
          '业务接口要求缓存命中和未命中都异步通知，应该怎么设计测试？',
          '先约定调用者能在通知前完成当前同步操作，再统一异步通知路径。测试命中和未命中时都先记录调用结束、后收到回调，并验证回调只触发一次。不要把业务契约绑定到未声明的 CJS/ESM 顶层输出顺序。',
        ],
      ],
    },
    {
      id: 'runtime-threadpool',
      title: '密码校验流量升高，读配置和域名解析也变慢',
      source: ['Node.js · UV_THREADPOOL_SIZE', 'https://nodejs.org/api/cli.html#uv_threadpool_sizesize'],
      check: '能指出共享池的竞争边界，设计混合负载实验，并区分池大小与业务并发。',
      steps: [
        [
          '异步 pbkdf2 大量运行后，fs.readFile 和 dns.lookup 耗时一起上涨，事件循环延迟却不高。可能发生了什么？',
          '这些 API 可竞争 libuv 的工作线程池。任务虽异步提交，池中仍可能排队；回调尚未准备好时，主事件循环可以保持空闲。检查各操作提交到完成的耗时与在途数量，减少密码校验负载，观察其他操作是否恢复。',
        ],
        [
          '所有网络请求也都必须经过这个线程池吗？',
          '不是。普通网络套接字 I/O 通常由系统异步机制处理；dns.lookup 使用系统名称解析并占用池，不能据此推导每次网络收发都占池。排查时明确实际调用的 API 与解析方式。',
        ],
        [
          '把 UV_THREADPOOL_SIZE 改成 128，是否能解决问题？',
          '增加池容量可能减少排队，也会增加 CPU 竞争和内存开销。先限制业务提交并发与队列长度，再按 CPU 配额做小范围对比；参数应在启动前设置，运行中修改 process.env 不能保证已创建的池跟着调整。',
        ],
        [
          '怎样证明调整没有只改善一个接口、拖慢其余请求？',
          '固定机器和输入，混合运行密码校验、轻量读文件及普通请求，分别比较吞吐、p95/p99、CPU 与拒绝数。记录并发上限和队列等待，加入持续过载场景，确认系统有明确的拒绝或降载行为。',
        ],
      ],
    },
    {
      id: 'runtime-isolation',
      title: '图片解析放进 Worker 后，为什么仍要考虑独立进程',
      source: ['Node.js · Worker threads', 'https://nodejs.org/api/worker_threads.html'],
      check: '能区分并行计算、数据传递和故障隔离，给出有上限的执行模型。',
      steps: [
        [
          'worker_threads 每个线程都有独立的 JavaScript 执行环境，因此并不是真正多线程，这句话对吗？',
          '不对。Worker 可以在真实线程上并行执行 JavaScript；默认对象堆彼此隔离，通信可复制数据、转移 ArrayBuffer，或显式共享 SharedArrayBuffer。堆隔离和是否并行是两个不同问题。',
        ],
        [
          '解析结果是普通对象，直接 postMessage 给主线程，会让两边共享同一个对象吗？',
          '普通可克隆对象通过结构化克隆传递，两边修改不会自动同步。转移缓冲区会改变原发送方的可用性，共享缓冲区则需要协调读写。先明确数据所有权，再比较复制、转移与共享的成本。',
        ],
        [
          '解析库带原生扩展，且可能触发进程级崩溃。只把它放进 Worker 能给 API 进程完整隔离吗？',
          '不能把同进程 Worker 当成完整的进程故障边界。对要求独立故障和资源控制的任务，可采用受限子进程或独立服务，并定义输入、结果与退出协议。Worker 的引擎 resourceLimits 也不等于覆盖所有原生内存的总上限。',
        ],
        [
          '每个 HTTP 请求新建一个 Worker，有什么问题？怎样验证改进？',
          '启动和初始化成本可能大于计算收益，流量激增还会创建过多线程。使用有容量与排队上限的池，处理超时、退出和待办任务回收；对短任务和大任务分别测端到端延迟、峰值线程数及拒绝行为。',
        ],
      ],
    },
    {
      id: 'runtime-memory-budget',
      title: 'heapUsed 只有 300 MB，1 GB 容器却被杀了',
      source: ['Node.js · process.memoryUsage', 'https://nodejs.org/api/process.html#processmemoryusage'],
      check: '能区分 JS 堆、进程驻留内存与容器限额，并避免把重叠指标相加。',
      steps: [
        [
          'Node heapUsed 没到 300 MB，容器却在 1 GB 限制下退出。第一步看什么？',
          '先核对退出原因与容器事件，再看同一时间段的 RSS、external、arrayBuffers、工作进程数量和容器总用量。JS 堆只是内存的一部分；仅凭 heapUsed 小，不能排除缓冲区、原生分配或其他进程占用。',
        ],
        [
          '能把 heapUsed、external、arrayBuffers 和 rss 全部相加，算出真实总量吗？',
          '不能，这些指标有包含或不同统计范围。arrayBuffers 包含 Node Buffer 的相关分配，并计入 external；RSS 是进程驻留页的统计。画趋势时分列展示，避免重复求和；有 Worker 时还要注意 RSS 为全进程，其他字段主要描述当前线程。',
        ],
        [
          '把 --max-old-space-size 设成容器的全部内存，为什么还可能更早失败？',
          '该参数控制 V8 老生代预算，不能限制整个进程。需要为年轻代、线程栈、原生库、缓冲区和运行环境留余量。读取 v8.getHeapStatistics().heap_size_limit 核实实际堆上限，再在目标容器限额下做峰值压力实验。',
        ],
        [
          'RSS 长期上涨但 GC 后 heapUsed 回落，能直接认定没有泄漏吗？',
          '不能。继续检查外部内存、缓冲区引用和原生分配；分配器碎片也可能使 RSS 不回落。比较固定负载多轮后的稳定区间，按增长来源选择堆快照或原生内存工具，避免只扩大堆上限。',
        ],
      ],
    },
    {
      id: 'runtime-shutdown',
      title: '滚动发布偶发断开导出请求，实时连接又迟迟不退出',
      source: ['Node.js · HTTP server.close', 'https://nodejs.org/api/http.html#serverclosecallback'],
      check: '能写出有截止时间的停机顺序，并覆盖活动请求、空闲连接和升级连接。',
      steps: [
        [
          '收到 SIGTERM 后立即 process.exit(0)，为什么健康检查都正常仍会丢请求？',
          '立即 exit 会截断在途响应、日志和数据库收尾。收到 SIGTERM 后先用标志位保证停机逻辑只执行一次，readiness 返回不可接流量，再让入口摘流并停止接受新连接；入口传播期间的新请求需明确拒绝或转移。在统一截止时间内等待在途 HTTP 请求结束，对 WebSocket 发关闭通知，停止定时任务和订阅，最后关闭连接池。到期后按协议取消剩余任务并强制清理。需单独登记升级连接；健康检查“曾经正常”并不能保证停机瞬间没有在途请求。',
        ],
        [
          '只调用 server.close()，会立即切断正在返回数据的 HTTP 请求吗？',
          '它停止接受新连接并等待相关连接收尾；现代 Node 还会关闭空闲连接，但不会等同于立即中断所有活动请求。行为要按部署版本验证，老版本需要另行处理空闲 keep-alive；超长请求仍需要业务超时与取消机制。',
        ],
        [
          '截止时间到了，调用 closeAllConnections() 后进程还被 WebSocket 留住，原因是什么？',
          '该方法会强制关闭 HTTP(S) 连接，可能截断活动请求；它不负责已经升级的 WebSocket 等连接。应用应登记升级连接，发送关闭通知并在期限后销毁，同时清理定时器和订阅。',
        ],
        [
          '你会怎样测试停机流程，而不是只确认进程最终退出？',
          '同时建立普通请求、慢流式响应、空闲 keep-alive 和 WebSocket，再触发停机。确认新流量不再进入，预算内的请求完成，超期请求按约定取消，升级连接结束，且进程在总截止时间内退出。',
        ],
      ],
    },
    {
      id: 'runtime-elu',
      title: '事件循环利用率接近 100%，CPU 却只有 10%',
      source: [
        'Node.js · Performance measurement APIs',
        'https://nodejs.org/api/perf_hooks.html#performanceeventlooputilizationutilization1-utilization2',
      ],
      check: '能解释 ELU 与 CPU 的口径差异，用同一时间窗和一个反例验证诊断。',
      steps: [
        [
          '监控显示 ELU 很高、CPU 很低，可以断言指标坏了吗？',
          '不能。ELU 统计事件循环在事件提供器等待之外的活跃时间，不等于 CPU 执行指令的时间。同步等待子进程等操作可以挡住循环却不消耗同等 CPU；结合线程状态、同步调用栈和请求延迟判断。',
        ],
        [
          '服务运行三天，今天发布后只卡了一分钟，直接读累计 ELU 为什么可能看不出来？',
          '累计值把三天内的空闲与活跃混在一起，发布后一分钟的尖峰容易被稀释。保存前一份原始采样，使用 API 计算窗口差值，并与相同时间窗的 CPU、吞吐及尾延迟对齐。不要把两个 utilization 百分数直接相减。下面每秒输出一个窗口指标；旧采样应更新成当前原始值，而不是 delta。↵const { performance } = require("node:perf_hooks");\nlet previous = performance.eventLoopUtilization();\nconst timer = setInterval(() => {\n  const current = performance.eventLoopUtilization();\n  const delta = performance.eventLoopUtilization(current, previous);\n  previous = current;\n  console.log(delta.utilization);\n}, 1000);\ntimer.unref();',
        ],
        [
          'monitorEventLoopDelay 的 p99 输出 20000000，面板显示延迟两千万毫秒，哪里错了？',
          '该直方图延迟值使用纳秒，换算成毫秒要除以 1000000，此处是 20 ms。记录采样分辨率和运行版本；窗口采集后按约定重置，避免把历史峰值长期当成当前异常。',
        ],
        [
          '如何用最小实验区分同步等待、CPU 计算和异步等待？',
          '在隔离环境分别运行有界同步子进程等待、固定时长计算和异步定时等待，同时采集窗口 ELU、CPU 与一个轻请求的尾延迟。前两类会挡住主循环但 CPU 表现不同；异步等待通常允许轻请求继续执行。',
        ],
      ],
    },
  ];
  PRACTICE_BANK.groups.push({id: group, name: 'Node 运行时与服务可靠性', cards: cases.map((c) => c.id)});
  for (const c of cases) PRACTICE_BANK.cards[c.id] = {...c, group};
  TOPIC_LEVELS.push({
    id: 25,
    name: '运行时与可靠性',
    desc: '线程池、内存、停机与指标口径',
    difficulty: 'hard',
    icon: '⚙️',
    questions: [
      {
        type: 'choice',
        chain: 'runtime-microtasks',
        q: '同一段代码的 .cjs 和 .mjs 顶层输出不同，判断 nextTick 与 Promise 顺序时应该先确认什么？',
        options: [
          '只看哪个 API 写得靠前',
          '模块格式、执行上下文和当前正在处理的队列',
          '只看文件大小',
          '只要是 Node 就固定 nextTick 永远最先',
        ],
        answer: 1,
        explain:
          '先确认模块格式和当前检查点。比如顶层依次安排 Promise、queueMicrotask、nextTick 时，常见 CJS 入口会先处理 nextTick，而 ESM 顶层求值已处于微任务过程，Promise/queueMicrotask 可以先执行。Promise 回调里新增 nextTick 也不会立刻打断当前微任务队列；应逐次记录入队并在目标 Node 版本验证。',
        detail: {
          example:
            '同一段顶层代码，作为 .cjs 入口大概是 S、N、P、Q（nextTick 先于 Promise），改成 .mjs 后可能变成 S、P、Q、N。因为 ESM 的顶层求值本身就处在微任务过程里，队列位置不一样。所以问“nextTick 和 Promise 谁先”之前，必须先确认模块格式和当前正在处理哪个队列，脱离上下文直接背结论一定会错。',
          code:
            'console.log(\'S\');\nPromise.resolve().then(() => console.log(\'P\'));\nqueueMicrotask(() => console.log(\'Q\'));\nprocess.nextTick(() => console.log(\'N\'));\n\n// .cjs 入口：S N P Q\n// .mjs 入口：S P Q N（视 Node 版本与上下文）',
          pitfalls:
            '把“nextTick 永远最先”当作通则，是最典型的误解，它只在某些执行上下文里成立。已经处于清空微任务队列的过程中时，新安排的 nextTick 不会插队打断当前队列。递归 queueMicrotask 会让队列永不空转，I/O 根本推进不了，这时应该换成 setImmediate 让出。',
        },
      },
      {
        type: 'choice',
        chain: 'runtime-threadpool',
        q: '大量异步 pbkdf2 导致 fs.readFile 与 dns.lookup 一起变慢，事件循环延迟不高，优先验证哪种竞争？',
        options: [
          '浏览器渲染线程竞争',
          'React 调度竞争',
          'libuv 工作线程池中的排队',
          '所有 TCP 数据都堵在 JS 数组里',
        ],
        answer: 2,
        explain:
          '这些 API 可共享 libuv 线程池。固定输入做混合负载，观测各 API 耗时、在途数、CPU 和其他轻请求的尾延迟。',
        detail: {
          example:
            '密码校验流量一上来，pbkdf2、fs.readFile、dns.lookup 一起变慢，可事件循环延迟并不高。原因是它们默认共用 libuv 的工作线程池，池子大小有限，任务虽然异步提交了，仍然要在池里排队；主事件循环这时是空闲的，所以延迟指标看着正常。固定输入跑混合负载，看各 API 的耗时和在途数就能确认。',
          code:
            '// 池子默认大小 4，启动前设置才有效\nUV_THREADPOOL_SIZE=8 node server.js\n\n// 运行中改 process.env 不会重建已经创建的池',
          pitfalls:
            '以为“异步”就等于“不排队”，是这里的关键误判，异步只是不占主线程。把 UV_THREADPOOL_SIZE 直接调到 128 不是答案，CPU 竞争和内存开销会一起上来。普通网络收发通常走系统异步机制，不是每次都经过这个池，只有 dns.lookup 这类会占用。运行中改环境变量对已创建的池无效。',
        },
      },
      {
        type: 'truefalse',
        chain: 'runtime-isolation',
        q: 'worker_threads 各自拥有 JavaScript 执行环境，因此无法在多个 CPU 核上并行执行 JavaScript。',
        answer: false,
        explain:
          'Worker 使用可并行执行的线程。普通对象默认不共享；线程并行、对象所有权和进程故障隔离需要分别讨论。',
        detail: {
          example:
            '把图片解析丢进 worker_threads 后，主线程确实不卡了，因为 Worker 跑在真实线程上，能在另一个核上并行执行 JavaScript。但“堆隔离”和“并行”是两件事：普通对象默认不共享，要传就结构化克隆或转移 ArrayBuffer。而且同进程 Worker 挡不住进程级崩溃，带原生扩展的解析库挂掉，主进程一样受影响。',
          pitfalls:
            '把“有独立执行环境”理解成“不能并行”，正好说反了，Worker 就是用来并行的。以为 postMessage 传的是同一个对象引用，其实普通对象是结构化克隆。把 Worker 当完整的安全边界，遇到原生扩展崩溃就失效，那种场景要用子进程或独立服务。每个请求新建一个 Worker，启动成本可能比计算本身还贵。',
        },
      },
      {
        type: 'choice',
        chain: 'runtime-memory-budget',
        q: '分析 Node 内存时，哪种统计方式会造成重复计算？',
        options: [
          '分列观察 RSS 和 heapUsed 的趋势',
          '把 arrayBuffers 再加到已包含它的 external 上',
          '检查容器退出原因与内存限额',
          '读取实际 heap_size_limit',
        ],
        answer: 1,
        explain: 'arrayBuffers 的相关分配已计入 external，各指标统计范围不同。容器总用量还可能包含其他进程。',
        detail: {
          example:
            '容器在 1 GB 限制下被杀了，可 heapUsed 才 300 MB。这时候把 heapUsed、external、arrayBuffers、rss 全部相加去“算真实总量”，结果会虚高——因为 arrayBuffers 的分配本来就已经算进 external 里了，加两次等于重复统计。正确做法是分列看趋势：RSS 是进程驻留，heapUsed 只是 JS 堆，external 是堆外分配。',
          code:
            'process.memoryUsage();\n// { rss, heapTotal, heapUsed, external, arrayBuffers }\n// external 已包含 arrayBuffers —— 不可相加',
          pitfalls:
            'reSS、heapUsed、external 的统计范围各自不同，求和没有意义。只看 heapUsed 小就排除内存问题，忽略了缓冲区、原生分配和其他进程。把 --max-old-space-size 设成容器全部内存，反而会因为没给年轻代、线程栈和原生库留余量而更早失败。RSS 涨但 GC 后 heapUsed 回落，也不等于没有泄漏。',
        },
      },
      {
        type: 'truefalse',
        chain: 'runtime-shutdown',
        q: 'Node HTTP 服务调用 closeAllConnections() 后，所有已经升级成 WebSocket 的连接也会自动关闭。',
        answer: false,
        explain:
          '该方法不负责升级后的连接。应用需要登记并关闭这些连接，并为排空请求、清理资源设置总截止时间。',
        detail: {
          example:
            '滚动发布时收到了 SIGTERM，调用 closeAllConnections() 之后进程却退不掉，因为还有几条已经升级成 WebSocket 的连接挂着；这个 API 只管 HTTP(S) 连接，升级后的连接不归它管。要自己登记这些连接，发关闭通知，到期再销毁，同时清掉定时器和订阅，最后才退出。',
          code:
            'server.close();                    // 停止接受新连接\nserver.closeAllConnections();      // 只关 HTTP(S)，不含升级连接\nfor (const ws of upgraded) ws.close();   // 升级连接要自己登记自己关',
          pitfalls:
            '以为 closeAllConnections 一把梭全关了，WebSocket 和 SSE 这类升级连接会被漏掉。收到 SIGTERM 立刻 process.exit(0)，会截断在途响应和日志。停机逻辑没有一次性标志位，可能重复执行。健康检查“曾经正常”不代表停机那一刻没有在途请求，readiness 要先摘流量再排空。',
        },
      },
      {
        type: 'choice',
        chain: 'runtime-elu',
        q: 'ELU 高、CPU 低，同时轻请求被阻塞，哪个假设值得优先验证？',
        options: [
          'ELU 与 CPU 必须相等，采集一定坏了',
          '内存一定已经用完',
          '网络带宽一定已打满',
          '主线程执行了同步等待操作，事件循环无法推进',
        ],
        answer: 3,
        explain:
          '同步等待子进程可能让主线程不能推进循环，但主线程并未持续计算，因此可以出现 ELU 高而 CPU 低。ELU 与 CPU 口径不同，还需确认 CPU 是单进程还是整机指标。对齐短窗口采样，结合调用栈和轻请求尾延迟检验该假设，不应只看累计利用率。',
        detail: {
          example:
            '监控显示事件循环利用率接近 100%，CPU 却只有 10%，轻请求全被卡住。这组合指向的是“主线程在同步等待”——比如同步调用子进程——它挡住了循环推进，但没有持续消耗 CPU，所以 ELU 高而 CPU 低。另外运行三天的服务只看累计 ELU，今天那一分钟的尖峰早就被稀释掉了，必须用窗口差值看。',
          code:
            'const { performance } = require(\'node:perf_hooks\');\nlet prev = performance.eventLoopUtilization();\nsetInterval(() => {\n  const cur = performance.eventLoopUtilization();\n  const delta = performance.eventLoopUtilization(cur, prev);\n  prev = cur;\n  console.log(delta.utilization);   // 用窗口差值，不用累计值\n}, 1000).unref();',
          pitfalls:
            '认为 ELU 和 CPU 必须相等，于是去查采集有没有坏，方向就偏了，两者口径本来不同。只读累计利用率，尖峰会被长期平均值淹没。monitorEventLoopDelay 的 p99 单位是纳秒，直接当毫秒显示会得出“延迟两千万毫秒”这种荒谬数字。CPU 指标还要分清是单进程还是整机。',
        },
      },
    ],
  });
}
