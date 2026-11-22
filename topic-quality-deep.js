'use strict';
{
  const group = 'quality-deep';
  const cards = [
    {
      id: 'quality-race-test',
      title: '搜索竞态只在线上出现，怎样写出必现的测试',
      source: ['Playwright · Network', 'https://playwright.dev/docs/network'],
      check: '能精确控制两次响应的释放顺序，并证明旧结果不能改写新查询的列表与 loading。',
      steps: [
        [
          '搜索 A 后马上搜索 B，偶尔显示 A 的结果。怎样让测试每次都复现，而不是把服务器设为慢速？',
          '在触发输入前注册请求拦截，按查询参数保存处理入口。先输入 A 并等它确实发出，再输入 B；两个请求都被捕获后，先释放 B 并断言显示 B，再释放 A，观察旧响应是否覆盖列表。这样不会被输入防抖合并成一次请求，也不依赖机器速度。',
        ],
        [
          '第二次查询开始后，A 的 finally 把 loading 设为 false。测试为什么只看最后列表会漏掉它？',
          '最终列表正确也不能证明 B 等待期间状态正确。单独安排这一轮：捕获 A 和 B 后暂不释放 B，先让 A 完成，立即断言 loading 仍为 true；再完成 B，才允许 loading 变 false。成功、catch 和 finally 都必须检查请求代际，例如 finally 中仅在 myId===activeId 时结束加载。另一轮再使用 B 先成功、A 后成功的顺序检查旧数据覆盖。两种顺序解决不同缺陷，不应只在全部请求结束后拍一张快照。',
        ],
        [
          '代码用了 AbortController，拦截层观察到 A 被取消，还需要做迟到响应测试吗？',
          '需要分别验证取消传播和状态提交保护。取消不代表所有异步后续都没机会运行，例如已开始的解析或缓存回调。可在组件测试注入忽略 signal 的受控 Promise，强制旧结果迟到；浏览器测试再验证真实请求收到取消。',
        ],
        [
          '这条回归测试要怎样证明不是永远都会通过？',
          '先在缺少请求代际校验的旧实现上运行，确认 B 成功后释放 A 会失败。修复后同时覆盖 A 迟到成功、A 迟到失败、B 失败和页面卸载；断言数据、错误提示与加载态归属于当前查询。测试收尾释放或取消所有闸门。',
        ],
      ],
    },
    {
      id: 'quality-properties',
      title: '排序函数跑了 20 个例子都通过，怎样继续找漏洞',
      source: ['fast-check · Property-Based Testing', 'https://fast-check.dev/docs/introduction/'],
      check: '能写出互相独立的排序性质、有效输入约束，并说明如何复现和缩小反例。',
      steps: [
        [
          '一个整数排序函数有 20 个固定用例和一张输出快照，还可以从什么角度验证？',
          '先定义输入为有限安全整数数组，并分别验证升序、长度和元素多重集不变；若契约要求纯函数，再比较调用前后输入。多重集可用 Map 计数，不能只用 Set，否则 [1,1,2] 变成 [1,2,2] 也会漏检。生成空数组、全重复、正负混合、已排序、逆序和极值；每个性质单独报错。固定快照适合保留已知反例，生成式测试用来探索组合，两者都需要可复现的 seed 与收缩结果。',
        ],
        [
          '只检查每个相邻元素都满足前者不大于后者，为什么不够？',
          '一个始终返回空数组的错误实现也满足该条件。需要独立验证长度和元素多重集保持一致；重复排序结果不变可以补充，但也不能替代内容保持。断言应来自契约，不能重写同一套排序代码当作真值。',
        ],
        [
          '随机测试失败后，第二天跑不出来，应该保存什么？',
          '保留生成器约束、随机种子、运行参数、工具版本和收缩后的最小反例。收缩会尝试减少长度与数值复杂度以定位触发条件；将最终反例加入固定回归用例，再保留生成式检查继续探索。',
        ],
        [
          '一万组生成输入全通过，能说明所有情况正确吗？',
          '只能说明在该输入模型和采样范围内未发现违反性质的样例。审查生成器是否遗漏空数组、重复极值与长数组，也检查性质本身是否太弱；复杂度要求需单独测量，采样测试不能代替证明。',
        ],
      ],
    },
    {
      id: 'quality-provider-contract',
      title: '前端 mock 全绿，后端把列表的空值改成了 null',
      source: ['Pact · How Pact works', 'https://docs.pact.io/getting_started/how_pact_works'],
      check: '能把消费者假设变成在真实提供方执行的验证，并指出契约测试覆盖不到的端到端条件。',
      steps: [
        [
          '前端 mock 一直返回 items: []，后端在无数据时改成 items: null，双方单测都通过。缺的是哪条验证链？',
          '消费者只验证了自己编写的替身。把消费者实际依赖的请求、响应字段和空列表语义固化成契约，再由提供方在相应业务状态下执行真实接口验证。模拟值与提供方实现之间需要可执行的连接。',
        ],
        [
          '测试数据里总有一条记录，怎样验证“没有记录”的契约？',
          '为提供方验证建立可重复的前置状态，例如指定账号没有记录，并隔离并行测试数据。分别表达有数据、空列表和无权限的交互，避免单靠随机数据库状态碰到边界。',
        ],
        [
          '后端给响应新增 traceId 会不会自动破坏契约？匹配规则怎样选？',
          '检查消费者真正依赖的最小结构，通常容许不影响消费的新增字段。身份和关键语义要严格，变化值用适当类型或模式匹配；items 为数组与允许 null 必须明确，过宽的“任意值”规则会掩盖当前故障。',
        ],
        [
          '最新版前后端契约都通过，为什么仍不能删掉端到端测试？',
          '还要核对实际部署和仍在使用的消费者版本。契约验证通信假设，无法单独证明真实鉴权配置、网关路由、跨服务状态和浏览器交互正确；保留关键用户路径与部署后的业务检查。',
        ],
      ],
    },
    {
      id: 'quality-timezone',
      title: '选同一个日期，上海和纽约用户查到不同日报',
      source: [
        'MDN · ZonedDateTime.add 的日期与时长语义',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal/ZonedDateTime/add',
      ],
      check: '能区分时间点、业务日期和显示时区，并解释夏令时日期为什么不能固定加 24 小时。',
      steps: [
        [
          '后台日报按纽约业务日统计，前端把日期选择器的值按浏览器本地零点传入，会发生什么？',
          '不同用户生成不同时间区间。先约定业务日期与 IANA 时区，例如 2026-03-08 和 America/New_York，再用服务端或支持该时区的日期工具转换成时间点。传输和存储明确时间戳或带偏移的 ISO 表示；页面显示也指定时区。',
        ],
        [
          '把某天零点加 86400000 毫秒当作下一天零点，在哪种条件下出错？',
          '跨夏令时时，日历上加一天与经过 24 小时不同。例如纽约 2026-03-08 00:00 是 UTC 05:00，下一日 00:00 是 UTC 04:00，两者只差 23 小时；若固定加 24 小时，就会跨到下一日 01:00。按业务时区先生成下一日的日历零点，再转换时间点；数据库用 created_at >= start AND created_at < nextStart。秋季切换还可能有 25 小时日，因此不能用“当天最后一毫秒”或固定时长替代日期边界。',
        ],
        [
          '只调用 Intl.DateTimeFormat 并指定 timeZone，能把任意本地日期字符串正确解析成该时区时间点吗？',
          '不能。它负责格式化已知时间值，不提供任意字符串的带时区解析。输入应按明确格式解析，并约定不存在或重复的本地时刻怎样处理；使用 Temporal 时核对目标环境支持，必要时采用兼容实现或交给服务端。',
        ],
        [
          '怎样设计测试，避免开发机在上海导致时区问题一直没被发现？',
          '固定业务时区，分别在上海和纽约浏览器环境断言生成相同查询边界。覆盖纽约 2026-03-08 的 23 小时日、2026-11-01 的 25 小时日、跨月和跨年，并验证相邻查询区间无重叠也无缺口。',
        ],
      ],
    },
    {
      id: 'quality-unicode',
      title: '昵称限制 10 个字，家庭表情却被截成半个',
      source: [
        'MDN · Intl.Segmenter constructor',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter/Segmenter',
      ],
      check: '能分别解释 UTF-16 码元、码点和字素簇，并把展示长度与存储、搜索契约分开。',
      steps: [
        [
          '昵称用 value.slice(0, 10) 截断，为什么某些 emoji 变成乱码或残缺图案？',
          'slice 和 length 使用 UTF-16 码元，可能拆开代理对；Array.from 按码点拆开，仍可能把家庭 emoji 的 ZWJ 组合或肤色修饰分离。若产品按用户感知字符限制，使用 Intl.Segmenter 的 grapheme 分段后取前 N 段，目标浏览器要验证支持。这个规则只决定展示截断，服务端仍需另外检查存储字节限制。↵function truncateNickname(value, max = 10) {\n  const segmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });\n  return Array.from(segmenter.segment(value), item => item.segment)\n    .slice(0, max).join("");\n}',
        ],
        [
          '前端最多 10 个字素簇，数据库字段上限 40 字节，两边一定兼容吗？',
          '不一定。一个字素簇可能包含多个码点，UTF-8 编码字节数也不同。分别定义展示长度与传输或存储字节限制，服务端做最终校验；不要把可见字符数量直接当作内存或数据库长度。',
        ],
        [
          '两个看起来相同的 é 搜不到对方，是否应该把所有文本统一做 NFKC 再保存？',
          '先确认是否是预组合字符与组合序列差异。可按搜索规则生成 NFC 等规范化索引，同时保留原始展示文本。NFKC 还会折叠兼容字符，可能改变标识含义；密码、签名原文和用户 ID 不能未经契约就静默改写。',
        ],
        [
          '怎么验证截断函数，而不只测一串中文？',
          '覆盖普通中文、代理对 emoji、家庭 ZWJ 序列、肤色修饰、旗帜和组合重音。断言输出字素簇数不超限、未截断内容保持原样、重复截断幂等；在目标浏览器验证 Segmenter 支持与约定的兼容处理。',
        ],
      ],
    },
    {
      id: 'quality-native-form',
      title: '点击发布与程序提交走了两套逻辑',
      source: [
        'MDN · HTMLFormElement.requestSubmit',
        'https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/requestSubmit',
      ],
      check: '能解释 click、submit、requestSubmit 与 submit() 的差别，并验证两个提交按钮的业务含义。',
      steps: [
        [
          '同一表单支持点击发布和调用 form.requestSubmit()，业务校验和请求却只绑定在发布按钮 click 上。两条路径为何可能不一致，怎样统一？',
          'requestSubmit() 走表单提交流程，不会替你执行按钮的 click 处理器。使用真实 form 和 submit 按钮，把最终提交逻辑放到 form 的 submit 处理器。键盘隐式提交可能会激活默认按钮，但不应依赖每个入口都先触发 click；附属的清空或预览按钮显式设 type="button"。',
        ],
        [
          '代码调用 form.submit() 后 required 字段和 submit 监听器都没生效，这是什么机制？',
          '直接 submit() 不执行交互式约束验证，也不触发 submit 事件。requestSubmit() 按提交按钮路径执行，在未指定跳过验证时先做约束验证，再进入 submit 事件；它不是简单的 submit() 别名。',
        ],
        [
          '同一表单有“存草稿”和“发布”，代码应该怎样表达具体提交动作？',
          '可以设置两个 type="submit" 按钮，name="action"，value 分别为 draft 与 publish；草稿若允许不完整字段，可显式 formnovalidate，发布仍走约束验证。在 form 的 submit 监听器中读 event.submitter?.value，并明确没有 submitter 时的默认动作；程序发布使用 form.requestSubmit(publishButton)。若使用 FormData(form) 组装请求，不要假定其中一定包含被点击按钮，需按兼容性使用带 submitter 的构造方式或显式补 action。后台独立校验动作、字段与权限。',
        ],
        [
          '这类表单的验收只点一遍按钮够吗？还应观察哪些结果？',
          '用 Tab 与 Enter 完成有效和无效提交，并测试程序触发、草稿与发布两个入口。断言请求次数和提交动作，检查错误与对应输入通过 label、aria-describedby 等关联，错误后能定位到需修正字段；原生校验不替代服务端校验。',
        ],
      ],
    },
  ];
  PRACTICE_BANK.groups.push({id: group, name: '测试设计、国际化与表单边界', cards: cards.map((c) => c.id)});
  for (const c of cards) PRACTICE_BANK.cards[c.id] = {...c, group};
  TOPIC_LEVELS.push({
    id: 27,
    name: '质量与国际化',
    desc: '竞态测试、契约、时区与字符边界',
    difficulty: 'hard',
    icon: '🧪',
    questions: [
      {
        type: 'choice',
        chain: 'quality-race-test',
        q: '怎样稳定复现“先搜索 A，再搜索 B，A 的迟到响应覆盖 B”？',
        options: [
          '等待固定五秒后截图',
          '把所有请求改成相同的延迟',
          '捕获两个请求，先释放 B 并断言，再释放 A 检查状态',
          '不断重跑直到偶尔失败',
        ],
        answer: 2,
        explain: '控制响应顺序才能稳定制造竞态，还要检查当前查询的加载态和错误提示未被旧请求修改。',
        detail: {
          example:
            '在输入前注册请求拦截，按查询参数存下处理入口。先输入 A 并等它真的发出，再输入 B，两个请求都被捕获后，先释放 B 断言显示的是 B，再释放 A，看旧响应会不会把列表覆盖掉。这样不靠机器速度，也不会被防抖合并成一次请求。只看最终列表还不够：B 等待期间 A 的 finally 把 loading 置为 false 这种问题，得单独安排一轮才看得见。',
          pitfalls:
            '等待固定五秒再截图，换台机器就可能不复现。把两个请求设成相同延迟，等于让它们同时到达，制造不出“旧的覆盖新的”。不断重跑等它偶尔失败，回归价值几乎为零。只断言最终列表正确，会漏掉加载态和错误提示被旧请求改掉的情况。用了 AbortController 也不代表可以不测迟到响应，已开始的解析和缓存回调仍可能回写。',
        },
      },
      {
        type: 'choice',
        chain: 'quality-properties',
        q: '排序测试只检查结果升序，下面哪个错误实现也可能通过？',
        options: ['始终返回空数组', '始终返回降序的不同值', '让两个相邻不同值逆序', '将最大值放到最前'],
        answer: 0,
        explain: '空数组满足相邻元素有序的条件。还需验证长度、元素多重集和契约要求的输入不变性。',
        detail: {
          example:
            '排序函数跑了 20 个固定用例都通过，但你只断言了“每个相邻元素前者不大于后者”。一个始终返回空数组的实现完全满足这个条件——它没有相邻元素。要补的是独立性质：长度不变、元素多重集不变（用 Map 计数而不是 Set，否则 [1,1,2] 变成 [1,2,2] 也能漏过），以及契约要求的输入不被修改。',
          code:
            '// 只检查有序：空数组实现也能通过\nconst ok = list.every((v, i) => i === 0 || list[i - 1] <= v);\n\n// 补上长度与多重集\nassert.equal(result.length, input.length);\nconst count = (a) => a.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());\nassert.deepEqual([...count(result)], [...count(input)]);',
          pitfalls:
            '把“有序”当成唯一性质，是这里最典型的漏洞。用 Set 做多重集比较会吞掉重复元素的变化。拿同一套排序代码当对照真值，等于用被测实现验证自己。生成式测试失败后不保存种子和收缩结果，第二天就跑不出来。一万组通过也只能说明采样范围内没发现问题。',
        },
      },
      {
        type: 'choice',
        chain: 'quality-provider-contract',
        q: '前端 mock 认为 items 必为数组，真实接口偶尔返回 null。哪项检查最直接连接这两边？',
        options: [
          '增加前端快照数量',
          '让消费者契约在提供方的空列表状态下执行验证',
          '只检查响应状态码是 200',
          '把所有匹配规则改为允许任意值',
        ],
        answer: 1,
        explain: '提供方验证应覆盖具体业务状态与消费者依赖的空值语义；仅测试自建替身不能证明真实接口兼容。',
        detail: {
          example:
            '前端 mock 一直返回 items: []，后端在无数据时改成了 items: null，两边单测都绿，联调才炸。缺的是把“消费者实际依赖的字段和空值语义”固化成契约，再让提供方在空列表状态下跑一遍真实接口验证。增加前端快照数量只加固你自己的替身，和真实接口能不能对上没关系。',
          pitfalls:
            '只测自建替身，证明不了真实接口兼容，这是契约测试存在的理由。测试数据里永远有一条记录，就永远碰不到空列表这个边界。把所有匹配规则改成“允许任意值”，会把当前故障一起吞掉。契约都通过了也不能删掉端到端测试，鉴权配置、网关路由、跨服务状态和浏览器交互它覆盖不到。',
        },
      },
      {
        type: 'truefalse',
        chain: 'quality-timezone',
        q: '在任意 IANA 时区，某天零点加 24 小时都等于下一天零点。',
        answer: false,
        explain:
          '错误。例如纽约 2026-03-08 的本地零点是 UTC 05:00，下一日本地零点是 UTC 04:00，只相隔 23 小时；固定加 24 小时会多跨一小时。按业务时区先计算日历上的下一日，再转换为时间点，用开始包含、结束不包含的区间查询。',
        detail: {
          example:
            '纽约 2026-03-08 的本地零点是 UTC 05:00，3 月 9 日的本地零点是 UTC 04:00，两者只差 23 小时——这天夏令时往前拨了一小时。所以“零点 + 24 小时 = 次日零点”在换季那天就不成立，固定加 86400000 毫秒会落到次日 01:00。正确做法是按业务时区先在日历上算出“下一日”，再转成时间点，查询用 created_at >= start AND created_at < nextStart。',
          code:
            '// 错误：跨夏令时会真的跨过 24 小时\nconst next = new Date(dayZero.getTime() + 86400000);\n\n// 正确：按业务时区算日历上的下一日\nconst start = zonedStartOfDay(\'2026-03-08\', \'America/New_York\');\nconst nextStart = zonedStartOfDay(\'2026-03-09\', \'America/New_York\');',
          pitfalls:
            '用“当天最后一毫秒”表示区间终点，在 25 小时的那天会漏数据。秋季切换可能生出 25 小时的一天，固定时长同样错。以为 Intl.DateTimeFormat 能把任意本地日期字符串解析成指定时区的时间点，它只负责格式化已知值。开发机都在上海，时区问题就一直测不出来，要固定业务时区并跨环境断言。',
        },
      },
      {
        type: 'choice',
        chain: 'quality-unicode',
        q: '昵称按用户感知字符截断，哪种方式能处理由多个码点构成的家庭 emoji？',
        options: [
          '直接按字符串 length 截断',
          '只用 split("") 拆分',
          '只用 Array.from 按码点拆分',
          '按 Intl.Segmenter 的 grapheme 粒度分段，并核对目标环境支持',
        ],
        answer: 3,
        explain:
          '家庭 emoji 👨‍👩‍👧‍👦 在 JavaScript 中占 11 个 UTF-16 码元、7 个码点，却可作为 1 个字素簇展示。Intl.Segmenter 使用 grapheme 粒度后按段截断，才能保留这个组合。展示字符限制还应与服务端 UTF-8 字节上限分开校验。',
        detail: {
          example:
            '昵称限制 10 个字，用 value.slice(0, 10) 截断后，家庭 emoji 👨‍👩‍👧‍👦 被切成半个，渲染成残缺图像。它在 JavaScript 里占 11 个 UTF-16 码元、7 个码点，但用户感知上是 1 个字符。用 Intl.Segmenter 按 grapheme 分段后再取前 N 段，组合结构才能保住。',
          code:
            'function truncateNickname(value, max = 10) {\n  const seg = new Intl.Segmenter(\'zh\', { granularity: \'grapheme\' });\n  return Array.from(seg.segment(value), (i) => i.segment)\n    .slice(0, max)\n    .join(\'\');\n}',
          pitfalls:
            'slice 和 length 按 UTF-16 码元切，会把代理对劈开。Array.from 按码点切，仍可能拆散 ZWJ 组合和肤色修饰。前端算 10 个字素簇，不等于数据库 40 字节够用，字节限制要服务端单独校验。把所有文本统一 NFKC 再保存会折叠兼容字符，用户 ID 和密码原文不能这么改。',
        },
      },
      {
        type: 'truefalse',
        chain: 'quality-native-form',
        q: 'form.submit() 与 form.requestSubmit() 都会先做原生约束验证并触发 submit 事件。',
        answer: false,
        explain:
          '直接 submit() 跳过约束验证与 submit 事件。requestSubmit() 走提交按钮语义，验证仍受 novalidate 等配置影响。',
        detail: {
          example:
            '同一张表单，点击发布按钮能用，程序里调 form.submit() 却既不校验 required 字段、也不触发 submit 监听器，请求根本没发出去。因为 submit() 是底层提交，绕过约束验证和 submit 事件；requestSubmit() 才走提交按钮的路径，会先做约束验证再进 submit 事件。把提交逻辑统一放进 form 的 submit 处理器，两条入口才会一致。',
          code:
            '// 跳过验证与 submit 事件\nform.submit();\n\n// 走按钮语义：先约束验证，再触发 submit\nform.requestSubmit();\nform.requestSubmit(publishButton);   // 指定 submitter',
          pitfalls:
            '把 submit() 当成 requestSubmit() 的别名，是最常见的一处混淆。业务逻辑只绑在按钮的 click 上，键盘隐式提交和程序提交就是另一套逻辑。草稿和发布两个按钮没设 name/value，submit 处理器分不清要做什么。原生约束验证不能替代服务端校验。',
        },
      },
    ],
  });
}
