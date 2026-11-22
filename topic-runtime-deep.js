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
          '不能。新安排的 nextTick 不会打断当前正在清空的微任务队列。先画出当前调用栈与两个队列，再逐次记录入队；用最小独立文件复现，避免测试框架本身改变调用上下文。',
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
          '进程退出会打断已有请求和异步收尾。进入排空状态后先从流量入口摘除实例，并让服务停止接收新连接；跟踪在途请求完成，再关闭依赖。为入口传播延迟和清理设置整体截止时间，明确超时后的处理。',
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
          '长期累计平均会稀释短时变化。保存上一个由 API 返回的采样值，通过差值计算同一短窗口的利用率，与该窗口 CPU、吞吐和延迟对齐。不要拿不同起止时间的指标互相解释。',
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
          'ESM 顶层求值本身处于微任务执行过程。要按调用栈、入队时机和检查点推演，不能把 CommonJS 顶层例子的顺序泛化。',
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
      },
      {
        type: 'truefalse',
        chain: 'runtime-isolation',
        q: 'worker_threads 各自拥有 JavaScript 执行环境，因此无法在多个 CPU 核上并行执行 JavaScript。',
        answer: false,
        explain:
          'Worker 使用可并行执行的线程。普通对象默认不共享；线程并行、对象所有权和进程故障隔离需要分别讨论。',
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
      },
      {
        type: 'truefalse',
        chain: 'runtime-shutdown',
        q: 'Node HTTP 服务调用 closeAllConnections() 后，所有已经升级成 WebSocket 的连接也会自动关闭。',
        answer: false,
        explain:
          '该方法不负责升级后的连接。应用需要登记并关闭这些连接，并为排空请求、清理资源设置总截止时间。',
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
          'ELU 不是 CPU 使用率；同步等待也可计入事件循环活跃时间。对齐时间窗口，结合调用栈和请求延迟验证。',
      },
    ],
  });
}
