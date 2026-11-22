'use strict';

{
  const group = 'language-deep';
  const cards = [
    {
      id: 'lang-resolution',
      title: 'Promise.resolve 能接住同步抛错吗',
      group,
      source: [
        'MDN · Promise.resolve',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/resolve',
      ],
      steps: [
        [
          'load() 在返回前抛出异常，Promise.resolve(load()).catch(report) 能接住吗？',
          '不能。调用参数先求值，异常发生时 Promise.resolve 还没执行。若希望统一处理同步异常与异步拒绝，可使用 Promise.resolve().then(() => load()).catch(report)，让 load 在 then 回调内执行。',
        ],
        [
          '第三方对象有 then(resolve)，但不是原生 Promise，Promise.resolve 会怎样处理？',
          '它会采用这个 thenable 的最终结果。如果 thenable 又 resolve 另一个 thenable，会继续解析，直到得到普通值或拒绝。调用方应等待返回的 Promise，不能用“具有 then 属性”推断结果已经成功。',
        ],
        [
          '如果 thenable 先调用 resolve(7)，随后 reject(error)，最后又抛错，结果是什么？',
          '第一次有效的 resolve 已锁定采用值 7，后续 reject 和抛错不会把它改成失败。若先抛错且尚未解决，会拒绝。手写实现需保证 resolve 与 reject 共享一次性状态。若第一次 resolve 的是仍 pending 的 Promise，则锁定的是采用它的命运，当前 Promise 还不一定 fulfilled。resolved 表示已决定如何结算，不能与 fulfilled 同义使用。',
        ],
        [
          '怎么测试一个 Promise 兼容封装，而不是只测成功值？',
          '构造普通值、同步抛错、拒绝 Promise、嵌套 thenable，以及重复调用回调的 thenable。分别断言最终结果和回调次数，再检验 then 回调在当前同步代码之后执行。',
        ],
      ],
      check: '能判断异常发生在哪个调用边界，并解释 resolved 与 fulfilled 的关系。',
    },
    {
      id: 'lang-all-boundaries',
      title: '手写 Promise.all 时数组边界容易漏什么',
      group,
      source: [
        'MDN · Promise.all',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all',
      ],
      steps: [
        [
          'Promise.all([]).then(() => log(1)); log(2)，输出顺序是什么？',
          '先 2 后 1。空输入对应的 Promise 已兑现，但注册的 then 回调仍异步执行。实现时应立即处理空集合，避免完成计数永远达不到触发条件。',
        ],
        [
          '手写版本用数组 forEach，输入 Array(2) 时为什么可能一直 pending？',
          'forEach 跳过空位，计数器没有累加。原生 Promise.all 消费可迭代输入，数组迭代会把这些位置作为 undefined，结果为 [undefined, undefined]。先说明实现支持数组还是一般 iterable，再按契约处理。',
        ],
        [
          'Promise.all([fetchA, fetchB]) 会开始两个请求吗？',
          '如果这两个值是函数，它们会作为普通值进入结果，调用方需要显式执行。Promise.all 聚合输入的结果，不负责猜测哪些值是待执行任务。若已经调用函数，产生的操作在聚合前可能已启动。',
        ],
        [
          '需要一批请求无论成功失败都收集结果，怎样选 API 并验证？',
          '可使用 allSettled，逐项读取 status 与 value 或 reason。用逆序完成、单项拒绝、空集合和普通值验证保序及终态；另外明确超时或取消策略，否则一个永不结算的请求会让整批一直等待。',
        ],
      ],
      check: '能区分任务启动与结果聚合，并覆盖空集合、稀疏数组和拒绝。',
    },
    {
      id: 'lang-finally',
      title: 'finally 为什么把原来的错误换掉了',
      group,
      source: [
        'MDN · Promise.finally',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/finally',
      ],
      steps: [
        [
          'Promise.resolve(3).finally(() => 9) 的最终值是什么？',
          '最终仍为 3。finally 回调不接收原值或原错误，正常返回普通值会继续传递原先的结果。它适合结束 loading、释放资源等收尾操作。',
        ],
        [
          '原请求拒绝，finally 里的清理又 throw 了一个错误，最后 catch 收到哪个？',
          '收到清理抛出的新错误。finally 返回拒绝的 Promise 也会产生同样的覆盖。重要任务应决定如何保存原始错误与清理错误，例如分别记录并明确对调用方暴露哪一个。',
        ],
        [
          'finally 返回一个要等两秒的 Promise，会延迟原结果传递吗？',
          '会等待该 Promise 结算；兑现后继续原结果，拒绝则改为新的拒绝。若只是非关键统计上报，不能无意间让主流程等待一个无超时的上报任务。',
        ],
        [
          '页面“请求结束但按钮还禁用”，怎样检查是否卡在 finally？',
          '把网络完成、业务处理、清理开始和清理结束分别计时。用可手动结算的清理 Promise 测试等待行为，再补清理拒绝的用例，核对 UI 收尾状态和两类错误的记录。',
        ],
      ],
      check: '能逐步推导收尾函数的返回值与抛错如何影响最终结果。',
    },
    {
      id: 'lang-bind-new',
      title: '绑定后的构造函数，new 会用谁的 this',
      group,
      source: [
        'MDN · Function.bind',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind',
      ],
      steps: [
        [
          'function Item(x) { this.x = x; } const Bound = Item.bind({x: 0}, 5); new Bound(8) 的 x 是多少？',
          '得到的新实例 x 为 5。new 使用新创建的实例作为 this，绑定的 this 被忽略；bind 预置的参数仍然位于本次参数之前，因此 Item 的第一个参数为 5。',
        ],
        [
          '把 bind 简写为返回 (...args) => fn.apply(ctx, args)，为什么构造场景失败？',
          '箭头函数本身不能被 new 调用，且这一包装固定使用 ctx，未处理构造调用语义。面试应先约定只支持普通调用，还是还需支持构造、原型和预置参数。',
        ],
        [
          '构造函数显式 return {ok: true}，new 的结果还是新实例吗？',
          '显式返回对象或函数时，构造结果采用那个值；返回普通原始值时通常采用创建的实例。用实例原型、instanceof 与自身属性检查结果，不能只看 this 曾被赋值。',
        ],
        [
          '怎样验收手写绑定函数是否符合你承诺的范围？',
          '覆盖普通调用的 this、预置参数顺序、二次绑定以及 new 调用。若承诺可构造，再测构造函数返回对象、原始值和抛错。对箭头目标应保留其无法构造的事实。',
        ],
      ],
      check: '能手算绑定参数，区分普通调用与构造调用的接收者。',
    },
    {
      id: 'lang-descriptors',
      title: '对象展开为什么触发 getter，还丢了属性规则',
      group,
      source: [
        'MDN · Object.getOwnPropertyDescriptors',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptors',
      ],
      steps: [
        [
          '源对象有一个可枚举 getter，执行 {...source} 时 getter 会调用吗？',
          '会读取源对象属性的值，因此 getter 被调用。新对象得到读取时的值，原来的 getter 定义不会随展开复制。如果 getter 昂贵或有副作用，复制过程就会产生额外行为。',
        ],
        [
          '希望复制 getter、setter、可写性与不可枚举属性，如何表达？',
          '读取 Object.getOwnPropertyDescriptors(source)，再用 Object.defineProperties 或 Object.create 传入描述符。若也要保留原型，可把 Object.getPrototypeOf(source) 作为 Object.create 的第一个参数。最小表达式是 Object.create(Object.getPrototypeOf(source), Object.getOwnPropertyDescriptors(source))。这一步不主动调用普通 getter；若 source 自己是 Proxy，读取描述符或原型仍可能触发其陷阱。',
        ],
        [
          '这样是不是就得到了任何对象的完整副本？',
          '这里只复制自身属性描述符和指定原型。描述符里的对象值仍共享引用；内置对象内部槽和 class 私有字段不会因此创建。对 Date、Map 或带私有字段实例应使用符合该类型契约的构造或序列化方案。',
        ],
        [
          '怎么验证复制方案没有意外执行访问器？',
          '给 getter 加计数器，复制描述符后断言计数仍为零，再读取副本属性验证其行为。检查不可枚举属性、Symbol 键和 writable 标志，并用嵌套对象修改确认是否符合预期的浅复制语义。',
        ],
      ],
      check: '能区分取值复制、描述符复制和实例重建。',
    },
    {
      id: 'lang-structured-clone',
      title: 'structuredClone 可以替代项目里的全部深拷贝吗',
      group,
      source: [
        'MDN · Structured clone algorithm',
        'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm',
      ],
      steps: [
        [
          '状态包含循环引用、Date 和 Map，用 JSON 序列化复制会有哪些问题？',
          '循环引用会使 JSON 序列化失败，Date 通常变成字符串，Map 的条目不会按其集合语义保存。structuredClone 支持这些常见数据结构并能保留循环引用关系，适合结构化数据快照。',
        ],
        [
          '对象里还带方法函数和 DOM 节点，structuredClone 会保留吗？',
          '函数和 DOM 节点不属于可结构化克隆的值，可能抛出 DataCloneError。需要定义数据边界，把行为、页面引用和可存储状态分开，再决定哪些字段进入快照。',
        ],
        [
          '自定义 class 实例被克隆后，为什么调用原型方法失败？',
          '结构化克隆不保留自定义原型链、属性描述符或私有字段。若业务需要恢复对象行为，应定义版本化的数据表示，通过构造或工厂显式重建实例并验证字段。',
        ],
        [
          '给 Worker 传 ArrayBuffer 时用 transfer，和复制有什么不同？',
          '转移会把可转移资源的所有权交给接收方，发送方的原缓冲区会失效。应在发送后停止使用该缓冲区，用字节内容和发送方失效状态测试所有权约定，并观察内存峰值。',
        ],
      ],
      check: '能按数据类型选择复制方案，并解释 transfer 后的所有权。',
    },
    {
      id: 'lang-esm-cycle',
      title: '模块互相 import，为何有时启动就报错',
      group,
      source: [
        'MDN · JavaScript modules',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules',
      ],
      steps: [
        [
          'A 与 B 相互 import 就一定运行失败吗？',
          '循环依赖本身不一定报错。关键在于模块求值时是否过早读取尚未初始化的绑定；在初始化完成后才通过函数读取可能正常。先画出导入图与顶层求值顺序。',
        ],
        [
          'B 在顶层读取 A 导出的 const，A 还在等待 B 求值，会发生什么？',
          '可能触发暂时性死区的 ReferenceError。导入声明能建立绑定，并不意味着对应的 const 已完成初始化。把读取延后可能改变行为，但也应评估依赖方向是否合理。可用两个文件复现：a.mjs 先 import "./b.mjs" 再 export const a=1；b.mjs 从 a.mjs 导入 a 并在顶层 console.log(a)。从 a.mjs 启动时，b 求值读取尚未初始化的 a，报 ReferenceError。将 console.log 延后到两模块初始化完成后调用的函数中才能避免这一读取时机。',
        ],
        [
          'A 导出 let count 并提供 increment，B 的命名导入会看到后续变化吗？',
          '命名导入是对导出绑定的实时引用，可以观察导出方对该绑定的更新。导入方不能直接给它重新赋值。若导出值是对象，其内部是否可变还取决于对象自身约束。',
        ],
        [
          '怎样修复循环依赖，避免只靠改变 import 顺序？',
          '把双方共用的纯类型、常量或函数下沉到无反向依赖的模块，或把协调工作放到上层初始化。测试从不同入口启动、测试环境与生产打包的行为，确认不依赖碰巧的求值顺序。',
        ],
      ],
      check: '能画出初始化时序，区分创建绑定与初始化绑定。',
    },
    {
      id: 'lang-conditional',
      title: '条件类型遇到联合类型，为什么结果变成两支',
      group,
      source: [
        'TypeScript · Conditional Types',
        'https://www.typescriptlang.org/docs/handbook/2/conditional-types.html',
      ],
      steps: [
        [
          'type Wrap<T> = T extends string ? {s:T} : {v:T}，Wrap<string | number> 是什么？',
          '结果是 {s:string} | {v:number}。被检查的是裸类型参数 T，传入联合类型时会分别应用条件再组合。可以把它理解为对联合成员逐个映射。',
        ],
        [
          '希望整体判断“所有输入都能赋给 string”，怎样阻止分配？',
          '把条件两边包进单元素元组，例如 [T] extends [string] ? X : Y。对于 string | number，整体不能赋给 string，因此进入 Y 分支。',
        ],
        [
          'type Item<T> = T extends readonly (infer U)[] ? U : never，能处理只读元组吗？',
          '能。只读数组约束覆盖只读元组，U 可推断为元素类型的联合。用 readonly [1, "x"] 验证，元素类型为 1 | "x"；传入普通对象则得到 never。',
        ],
        [
          '类型工具在编辑器里看着正确，怎样写可维护的验证？',
          '给典型输入写期望类型的赋值检查，给应失败的赋值加 @ts-expect-error 并运行 tsc。覆盖联合、never、只读元组和非目标类型，避免只展示一段漂亮的类型定义。',
        ],
      ],
      check: '能手算分配条件类型，并用元组包装控制分配。',
    },
    {
      id: 'lang-generics-readonly',
      title: '泛型返回值怎样保持输入与输出的对应关系',
      group,
      source: ['TypeScript · Generics', 'https://www.typescriptlang.org/docs/handbook/2/generics.html'],
      steps: [
        [
          '写 get(obj, key)，怎样保证返回值对应所选字段，而不是所有字段值的联合？',
          '使用 function get<T, K extends keyof T>(obj: T, key: K): T[K] { return obj[key]; }。K 保留具体键的关系，例如取 count 时得到 number；若 key 本身是联合，返回值相应成为联合。',
        ],
        [
          '如果 key 来自 URL，是一个运行时字符串，直接断言成 keyof T 会怎样？',
          '断言不会检查对象确实拥有这个字段。应先验证外部输入是否属于允许的字段集合，再进行类型收窄或返回明确的缺失结果。工具函数的泛型不能替代网络边界校验。',
        ],
        [
          '参数标为 Readonly<T>，能保证被调函数和外部引用都无法改变嵌套对象吗？',
          'Readonly 通常只把顶层属性标为只读，嵌套对象仍可能可变，其他可写别名也可能修改同一数据。类型只读提供编译时约束，运行时冻结和递归不可变需要单独设计。',
        ],
        [
          '调用方传来 as const 数组，工具参数写 T[] 为什么可能不兼容？',
          '只读数组不能安全地当作允许 push 的可写数组。只读查询工具可接收 readonly T[] 或 ReadonlyArray<T>，既接受只读输入，也表达函数不会修改容器的承诺。',
        ],
      ],
      check: '能维持键与返回值的类型关联，并说明只读的作用范围。',
    },
    {
      id: 'lang-generator-close',
      title: '迭代到一半 break，资源何时释放',
      group,
      source: [
        'MDN · Iterators and generators',
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_generators',
      ],
      steps: [
        [
          '用 generator 按页读记录，for...of 中途 break 时 finally 会执行吗？',
          '生成器已经进入 try 且仍暂停在 yield 时，循环提前退出通常会调用迭代器 return()，使生成器执行 finally 中的清理。把资源释放放在 try/finally 中，并验证提前退出路径。例如 function* rows(){try{yield 1;yield 2;}finally{close();}}，for(const x of rows()){break;} 会执行 close。若尚未开始执行生成器体就直接 return，尚未进入的 try/finally 不会凭空执行；若 finally 自己又 yield，单次 return 也未必完成所有清理。',
        ],
        [
          '手写迭代器只有 next，没有 return，会有什么遗漏？',
          '正常读完可以工作，但提前停止时缺少一个显式清理入口。若持有文件句柄、订阅或后台任务，应实现符合协议的 return，返回一个对象并执行幂等清理。',
        ],
        [
          '用展开语法 [...iterator] 处理未知大小的数据流有什么问题？',
          '展开会持续消费并保存全部元素。无限迭代器无法完成，巨大集合会占用大量内存。按批消费或限制数量，并把停止时的清理行为纳入接口契约。',
        ],
        [
          '怎样验收分页迭代器既能完成，也能及时停止？',
          '注入可计数的拉取与释放函数，测试正常耗尽、第一条后 break、业务处理抛错及主动 return。断言释放次数、停止后是否继续拉取，以及重复清理是否安全。',
        ],
      ],
      check: '能区分正常耗尽与提前关闭，并设计资源清理的回归用例。',
    },
  ];
  PRACTICE_BANK.groups.push({
    id: group,
    name: 'JavaScript 与 TypeScript 深入',
    cards: cards.map((card) => card.id),
  });
  for (const card of cards) PRACTICE_BANK.cards[card.id] = card;

  TOPIC_LEVELS.push({
    id: 21,
    name: 'JS 与 TS 边界推演',
    desc: '异步语义、对象复制、模块与类型',
    icon: '🔬',
    difficulty: 'hard',
    questions: [
      {
        type: 'choice',
        chain: 'lang-resolution',
        q: 'load() 可能同步抛错，也可能返回拒绝 Promise，哪种写法能把两类失败送到同一个 catch？',
        options: [
          'Promise.resolve(load()).catch(report)',
          'Promise.resolve().then(() => load()).catch(report)',
          'Promise.resolve(load).catch(report)',
          'Promise.all([load]).catch(report)',
        ],
        answer: 1,
        explain:
          'then 回调里调用 load，回调抛错会让返回的 Promise 拒绝，返回 Promise 也会被采用。直接先计算 load() 的写法，可能在建立 Promise 链前就抛错。',
      },
      {
        type: 'choice',
        chain: 'lang-all-boundaries',
        q: 'Promise.all(Array(2)) 的成功结果应是什么？',
        options: ['永远 pending', '抛出语法错误', '[undefined, undefined]', '空数组'],
        answer: 2,
        explain:
          '数组迭代器会把空位作为 undefined 产生。手写版若用跳过空位的 forEach 加计数器，需要额外处理这个边界。',
      },
      {
        type: 'choice',
        chain: 'lang-finally',
        q: 'Promise.resolve(3).finally(() => Promise.resolve(9)) 最终兑现为什么值？',
        options: ['3', '9', 'undefined', '同时返回 3 和 9'],
        answer: 0,
        explain:
          'finally 等待回调返回的 Promise 兑现，再继续传递原值 3。若收尾 Promise 拒绝，则最终链转为该拒绝。',
      },
      {
        type: 'truefalse',
        chain: 'lang-bind-new',
        q: '对可构造函数使用 bind 后，再用 new 调用绑定结果，绑定的 this 会优先于新实例。',
        answer: false,
        explain:
          '构造调用使用新实例作为 this，预置参数仍然生效。只用普通 apply 包装的简化 bind 未必支持这一构造语义。',
      },
      {
        type: 'choice',
        chain: 'lang-descriptors',
        q: '需要保留自身 getter、不可枚举属性和 writable 标志，怎样复制属性更合适？',
        options: [
          'JSON.parse(JSON.stringify(obj))',
          '{...obj}',
          '只循环 Object.keys 并赋值',
          '读取全部自身描述符，再用 defineProperties 定义',
        ],
        answer: 3,
        explain:
          '读取 Object.getOwnPropertyDescriptors(obj)，再用 Object.defineProperties(target, descriptors)。若还需保留原型，可用 Object.create(Object.getPrototypeOf(obj), descriptors)。这样保留自身访问器及可写/可枚举/可配置规则；展开语法会读取 getter 并把结果变成普通数据属性。描述符中的对象值仍共享引用，Map 内部槽和 class 私有字段不在这个复制契约内。',
      },
      {
        type: 'choice',
        chain: 'lang-conditional',
        q: 'type IsString<T> = [T] extends [string] ? true : false；IsString<string | number> 是什么？',
        options: ['true', 'true | false', 'false', 'never'],
        answer: 2,
        explain: '元组包装抑制了对裸类型参数的分配。string | number 整体不能赋给 string，所以结果为 false。',
      },
      {
        type: 'truefalse',
        chain: 'lang-esm-cycle',
        q: 'ES 模块的命名导入能观察导出 let 绑定后续的更新。',
        answer: true,
        explain:
          '导入使用实时绑定，导出方更新该绑定时可以被观察。导入方不能给它重新赋值；循环依赖还需考虑读取时绑定是否已初始化。',
      },
      {
        type: 'text',
        chain: 'lang-generator-close',
        q: '分页生成器在第三页读取前，消费者已经 break。你会用哪三项断言验证资源收尾？',
        explain:
          '注入 fetchPage 和 close 的计数桩：①前两页取完并 break 后，close 次数应为 1；②fetchPage 的调用记录只能含第 1、2 页，不能再请求第 3 页；③随后主动调用 iterator.return()，close 仍为 1且不再拉取。前提是生成器已进入 try/finally、没有预取。再测正常耗尽与消费方抛错；若有后台预取，契约应改为取消并等待在途请求收尾。',
      },
    ],
  });
}
