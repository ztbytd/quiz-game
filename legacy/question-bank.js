'use strict';
// Question order and level IDs are persisted in learner progress. Keep them stable.
const LEVELS = [
  {
    id: 0,
    name: 'JavaScript 基础村',
    desc: 'JS 核心概念与原理',
    difficulty: 'easy',
    icon: '🌱',
    questions: [
      {
        type: 'choice',
        q: '说说 JavaScript 中的事件循环（Event Loop）机制？',
        options: [
          '就是先执行同步代码再执行异步代码',
          '同步代码在调用栈执行，异步任务完成后回调放入任务队列，事件循环不断检查栈是否清空，清空后从队列取回调执行；微任务（Promise.then）优先于宏任务（setTimeout）',
          '事件循环就是 setInterval',
          '所有代码都是同步执行的没有事件循环',
        ],
        answer: 1,
        explain:
          '浏览器中，一段同步 JavaScript 在调用栈上执行至返回。定时器、网络等由宿主推进，满足条件后安排相应任务；在微任务检查点，Promise 回调、queueMicrotask 等会被持续处理到队列清空。浏览器随后可能进行渲染，并选择后续任务。不能把所有异步来源想成一个严格先进先出的全局队列。',
        detail: {
          example:
            '下面输出 A、D、C、B。同步日志先执行，Promise 回调在定时器任务之前运行。即使先设置 loading，再进行长同步计算或无限追加微任务，也会推迟画面更新。',
          code: "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nconsole.log('D');",
          pitfalls:
            'setTimeout(0) 不是立即执行；一次任务结束不保证一定绘制。requestAnimationFrame 在渲染机会前执行，里面的大计算也可能阻塞当前帧。Node 的阶段与 nextTick 需要单独讨论。',
          followups: [
            [
              'Promise.then 里再添加微任务呢？',
              '会继续排入微任务队列，通常在本次检查点继续清空；递归添加可能使定时器、输入和绘制长期得不到机会。',
            ],
          ],
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model'],
          ],
        },
        chain: 'loop',
      },
      {
        type: 'choice',
        q: '说说闭包是什么？有什么实际应用？',
        options: [
          '闭包就是函数套函数没有特殊用途',
          '函数可以访问其外层作用域的变量即使外层函数已执行完毕；用于数据私有化、模块化、防抖节流、柯里化',
          '闭包会导致内存泄漏不应该使用',
          '闭包是 ES6 新增的',
        ],
        answer: 1,
        explain:
          '闭包是函数与它创建时可访问的词法环境的组合。函数被带到外层作用域之外调用时，仍能按词法作用域访问原来的绑定。它捕获的是可继续读写的绑定，不是创建瞬间的一份变量快照。常用于保存私有状态、生成带配置的函数，以及防抖定时器。',
        detail: {
          code: 'function makeCounter() {\n  let count = 0;\n  return () => ++count;\n}\nconst a = makeCounter(), b = makeCounter();\nconsole.log(a(), a(), b()); // 1 2 1',
          example:
            'a 的两次调用共享同一份 count；b 来自另一次调用，拥有独立绑定。即使 makeCounter 已返回，a 仍然可以使用它对应的状态。',
          pitfalls:
            '闭包不会必然泄漏。只有不再需要的数据仍沿活动监听器、全局缓存等引用链可达时，才会继续占用内存。取消订阅并移除不需要的引用后，相关环境可以回收。',
          sources: [['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures']],
        },
        chain: 'memory',
      },
      {
        type: 'choice',
        q: 'var、let、const 三者的区别？',
        options: [
          'var、let、const 都是块级作用域',
          'var 可在声明前读到 undefined；let/const 是块级绑定并存在暂时性死区，const 禁止重新赋值',
          'const 会自动深度冻结对象',
          'let 在初始化前读取总会得到 undefined',
        ],
        answer: 1,
        explain:
          'var 通常是函数作用域，可在同一作用域重复声明，绑定在执行到赋值前已初始化为 undefined。let、const 是块级作用域，在声明初始化前处于暂时性死区，访问会抛 ReferenceError；因此不能简单说它们“没有提升”。const 要在声明时初始化，禁止重新赋值，但不会递归冻结对象。',
        detail: {
          code: 'console.log(a); // undefined\nvar a = 1;\n{\n  // console.log(b); // ReferenceError：TDZ\n  let b = 2;\n}\nconst obj = {n: 1};\nobj.n = 2; // 可以\n// obj = {}; // TypeError',
          example:
            'for 循环中的 let 会为迭代建立相应绑定，回调可各自读到当次值；同一函数作用域的 var 循环变量通常被所有回调共享。',
          pitfalls:
            '脚本顶层 var 与 let/const 对全局对象的影响不同；ESM 顶层是模块作用域。typeof 访问未声明标识符可得 undefined，但访问 TDZ 中绑定仍会抛错。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/let'],
          ],
        },
      },
      {
        type: 'choice',
        q: '说说原型链是什么？如何实现继承？',
        options: [
          '原型链就是 prototype 属性的链条',
          '属性查找沿对象的内部原型关系向上进行，直到 null；可用 Object.getPrototypeOf 观察原型，class extends 可建立继承关系',
          '原型链是 ES6 才有的',
          '原型链和继承没有关系',
        ],
        answer: 1,
        explain:
          '对象查找属性时先检查自身，再沿内部 [[Prototype]] 指向的对象逐级查找，直到 null。构造函数的 prototype 是供实例关联的对象，与函数自身的内部原型是不同关系。继承可用 Object.create 建立委托关系，也可用 class extends 同时安排实例方法和构造器的继承链。',
        detail: {
          code: "class Person {\n  constructor(name) { this.name = name; }\n  greet() { return 'Hi ' + this.name; }\n}\nclass Dev extends Person {\n  constructor(name, skill) { super(name); this.skill = skill; }\n}\nconst d = new Dev('Ye', 'JS');\nconsole.log(d.greet()); // Hi Ye\nconsole.log(Object.getPrototypeOf(d) === Dev.prototype); // true\nconsole.log(Object.getPrototypeOf(Dev.prototype) === Person.prototype); // true",
          pitfalls:
            '__proto__ 是历史访问器，Object.create(null) 甚至不继承它。实例 name 属于自身，greet 在原型上；实例写同名属性通常会遮蔽继承属性，访问器或只读描述符则另有规则。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Inheritance_and_the_prototype_chain',
            ],
          ],
        },
        chain: 'prototype',
      },
      {
        type: 'choice',
        q: 'this 的指向规则？箭头函数的 this 有什么不同？',
        options: [
          'this 永远指向 window',
          '普通函数 this 由调用形式决定：独立调用时严格模式为 undefined，非严格模式通常为全局对象；箭头函数捕获外层 this',
          '箭头函数的 this 指向 window',
          'this 在函数定义时就确定了',
        ],
        answer: 1,
        explain:
          '普通函数的 this 由调用方式决定：obj.fn() 通常得到 obj；独立严格模式调用为 undefined；call/apply 指定接收者；bind 预先绑定普通调用的接收者；new 调用使用新实例。非严格函数会把 null/undefined 接收者替换为全局对象并包装原始值。箭头函数没有自己的 this，会沿词法环境读取外层 this。',
        detail: {
          code: "'use strict';\nconst obj = {n: 3, get() { return this?.n; }};\nconst fn = obj.get;\nconsole.log(obj.get(), fn(), fn.call({n: 8})); // 3 undefined 8\nfunction factory() { return () => this.n; }\nconst arrow = factory.call({n: 5});\nconsole.log(arrow.call({n: 9})); // 5",
          pitfalls:
            '“谁调用指向谁”必须落实到调用表达式，取出方法再调用会失去原接收者。箭头函数不能用 new，call/apply/bind 也不能替换它捕获的 this；仍可通过 bind 预置参数。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/this'],
          ],
        },
        chain: 'prototype',
      },
      {
        type: 'choice',
        q: 'Promise 的状态有哪些？Promise.all 和 Promise.race 的区别？',
        options: [
          '状态可随意回退',
          'Promise 从 pending 进入 fulfilled 或 rejected；all 汇总全部兑现值，race 采用最先结算的结果',
          'all 任意一个成功就成功',
          'race 会自动取消其他任务',
        ],
        answer: 1,
        explain:
          'Promise 有 pending、fulfilled、rejected 三种状态，结算后不能转向另一终态。all 消费可迭代输入，按输入顺序收集所有兑现值，任一拒绝使组合结果拒绝；race 采用最先结算项的成功或失败。两者都不自动取消其余操作，也不会主动调用输入中的函数。',
        detail: {
          example:
            'all([慢请求A,快请求B]) 最终顺序仍为 [A结果,B结果]。all([]) 返回已兑现的空数组 Promise，但 then 仍异步；race([]) 会一直 pending。普通值也会被按 Promise.resolve 处理。',
          pitfalls:
            'resolved 不完全等于 fulfilled：resolve 采用另一个仍 pending 的 Promise 时，命运已经锁定但尚未兑现。用 race 做超时只能让外层先失败，底层 fetch 是否停止仍需 AbortController。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all',
            ],
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/race',
            ],
          ],
        },
        chain: 'lang-all-boundaries',
      },
      {
        type: 'choice',
        q: 'async/await 的原理？和 Promise 是什么关系？',
        options: [
          'async/await 是 Promise 的替代品完全独立',
          'async 函数返回 Promise；await 暂停当前异步函数的后续执行，处理普通值、Promise 或 thenable，拒绝可用 try/catch 捕获',
          'await 只能等待 Promise',
          'async 函数不返回 Promise',
        ],
        answer: 1,
        explain:
          'async 函数总是返回 Promise：正常返回值用于兑现，未捕获异常用于拒绝。await 接受普通值、Promise 或 thenable，暂停当前 async 函数的后续执行；兑现后异步恢复并得到值，拒绝时在 await 处抛出，可由 try/catch 捕获。等待不会阻塞整个线程，但 await 前后的同步计算仍会占用线程。',
        detail: {
          code: "async function work() {\n  console.log('A');\n  const x = await 3;\n  console.log('B', x);\n  return x + 1;\n}\nconst p = work();\nconsole.log('C');\np.then(x => console.log('D', x));\n// A, C, B 3, D 4",
          pitfalls:
            '先 await A 再发 B 是串行；无依赖的操作可先都启动，再 await Promise.all。async 返回的 Promise 不必与 return 的原 Promise 是同一对象。Generator 执行器可以模拟控制流，但不是关于引擎实现的结论。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function',
            ],
          ],
        },
        chain: 'lang-resolution',
      },
      {
        type: 'choice',
        q: '说说 JavaScript 的垃圾回收机制？',
        options: [
          'JavaScript 必须手动释放每个对象',
          '回收主要依据可达性；V8 可结合分代及增量、并发等机制，具体实现随版本变化',
          '互相引用的两个对象永远无法回收',
          'GC 可以保证在指定毫秒内释放网络连接',
        ],
        answer: 1,
        explain:
          '垃圾回收器以可达性判断对象是否仍需保留：从活动执行环境、全局根等出发追踪引用，不可达对象可以被回收，即使它们彼此循环引用。V8 常按对象寿命分代，并结合标记、清扫、整理、增量和并发工作控制暂停；具体算法与阈值会随版本变化。',
        detail: {
          example:
            '页面离开后，window 上的监听器仍引用一个包含大量行数据的闭包，该数据仍可达。仅删除页面 DOM 或把局部变量设成 null，未必切断监听器这条引用链；应配对解绑监听、清除订阅与无界缓存。',
          pitfalls:
            'GC 的时机不确定，不能用它代替文件、连接、定时器等业务资源的主动关闭。排查时重复执行同一交互，比较 GC 后存活对象与保留路径；单次堆大小上涨不等于泄漏。',
          sources: [['V8 · Orinoco', 'https://v8.dev/blog/trash-talk']],
        },
        chain: 'memory',
      },
      {
        type: 'choice',
        q: '深拷贝和浅拷贝的区别？怎么实现深拷贝？',
        options: [
          '没区别都是复制',
          '浅拷贝只复制第一层嵌套对象共享引用(Object.assign/展开运算符)；深拷贝递归复制所有层级(JSON.parse(JSON.stringify())有局限 structuredClone()推荐 或递归处理循环引用)',
          'JSON.parse(JSON.stringify()) 能正确处理函数和 Date',
          '展开运算符是深拷贝',
        ],
        answer: 1,
        explain:
          '浅拷贝创建新的外层容器，但嵌套对象仍共享引用；深拷贝按约定复制对象图，并处理循环引用与同一对象被多处引用的情况。结构化数据可用 structuredClone；自定义克隆需先定义支持类型，再用已访问映射连接原对象与副本。JSON 序列化是有损的数据转换，不能当成通用深拷贝。',
        detail: {
          code: 'const a = {child: {n: 1}}; a.self = a;\nconst shallow = {...a};\nconst deep = structuredClone(a);\nshallow.child.n = 2;\nconsole.log(a.child.n, deep.child.n); // 2 1\nconsole.log(deep.self === deep); // true',
          pitfalls:
            'structuredClone 支持 Date、Map、Set、循环引用等，但不复制函数与 DOM 节点，也不保留任意自定义原型、属性描述符或私有字段。JSON 会把 Date 变为字符串，丢失部分字段，遇到环或 BigInt 等输入会失败。',
          sources: [
            [
              'MDN · structuredClone',
              'https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone',
            ],
          ],
        },
        chain: 'lang-structured-clone',
      },
      {
        type: 'choice',
        q: 'call、apply、bind 三者的区别？',
        options: [
          '三者完全一样',
          'call 和 apply 立即执行 call 逐个传参 apply 传数组；bind 返回绑定了 this 的新函数不立即执行',
          'bind 会立即执行函数',
          'apply 的参数是逗号分隔的',
        ],
        answer: 1,
        explain:
          'call(thisArg,...args) 立即调用；apply(thisArg,argsLike) 也立即调用，参数通过数组或类数组提供；bind(thisArg,...preset) 返回新函数，普通调用使用绑定接收者，预置参数排在后来参数前。目标是箭头函数时，它的词法 this 不会被这些 API 改写。',
        detail: {
          code: 'function sum(a, b) { return this.base + a + b; }\nconst ctx = {base: 10};\nconsole.log(sum.call(ctx, 1, 2)); // 13\nconsole.log(sum.apply(ctx, [1, 2])); // 13\nconst addOne = sum.bind(ctx, 1);\nconsole.log(addOne(5)); // 16',
          pitfalls:
            '绑定函数再次 bind 不能替换首次绑定的 this，但可继续预置参数。若目标可构造，new 绑定函数时忽略绑定的 this，并保留预置参数；因此“this 永久固定”只适合描述普通调用。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind',
            ],
          ],
        },
        chain: 'lang-bind-new',
      },
      {
        type: 'truefalse',
        q: "typeof null 返回 'null'。",
        answer: false,
        explain:
          "错误。typeof null 的结果是字符串 'object'；判断 null 直接使用 value === null。typeof 对函数返回 'function'，对数组也返回 'object'，因此不同数据类型需要匹配的检测方式，例如 Array.isArray。",
        detail: {
          pitfalls:
            'Object.prototype.toString 可辅助识别某些内置类型，但 Symbol.toStringTag 可影响标签，不能把一个标签字符串当成可信的类型或权限验证。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof'],
          ],
        },
      },
      {
        type: 'truefalse',
        q: '== 比较时会进行类型转换，=== 不会。',
        answer: true,
        explain:
          '这句话成立：宽松相等 == 在某些跨类型比较中执行转换，严格相等 === 不做这种转换。例如 1 == "1" 为 true，1 === "1" 为 false；null == undefined 为 true。对象与原始值的宽松比较还可能触发对象的原始值转换。',
        detail: {
          example:
            'NaN === NaN 为 false，+0 === -0 为 true。Object.is 的这两个结果相反。Map/Set 使用 SameValueZero：NaN 与自身视为相同，正负零也相同。',
          pitfalls:
            '=== 比较对象时判断对象身份，不会递归比较内容。业务若明确要同时接受 null/undefined，可有意识使用 x == null；其他场景尽量明确输入类型。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Equality_comparisons_and_sameness',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: 'JavaScript 中所有对象都是通过 new 创建的。',
        answer: false,
        explain:
          '错误。对象字面量、数组字面量、函数表达式、Object.create 等都可以创建对象，并不要求源代码出现 new。Object.create(proto) 直接指定新对象的原型；Object.create(null) 创建不继承 Object.prototype 的对象。',
        detail: {
          code: 'const plain = {};\nconst list = [];\nconst fn = function () {};\nconst dict = Object.create(null);\nconsole.log(Object.getPrototypeOf(dict)); // null',
          pitfalls:
            '“没有写 new”和“没有创建对象”不是一回事；而 typeof 返回 object 也不足以证明某值可作为普通对象使用，例如 null。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '说说 JavaScript 的执行上下文和作用域链？',
        options: [
          '执行上下文只包含 this',
          '运行时建立执行上下文，标识符沿词法环境链查找；函数外层环境与定义位置相关',
          '函数可以自动读取任何调用者的局部变量',
          '严格模式完全禁止调用 eval',
        ],
        answer: 1,
        explain:
          '执行上下文记录运行代码所需的状态，包括当前代码、词法环境、变量环境等；上下文在调用中压栈、返回后出栈。标识符解析沿词法环境的外层引用逐级查找，函数创建时保存外部环境关联，因此作用域来自定义位置，而不是调用者所在位置。this 的绑定规则与标识符查找要分开。',
        detail: {
          code: 'const x = 1;\nfunction read() { return x; }\nfunction caller() { const x = 2; return read(); }\nconsole.log(caller()); // 1',
          pitfalls:
            '词法环境/变量环境是规范中的记录机制，不宜机械理解成两个独立 JS 对象或“var 和 let 永远各占一张表”。严格模式禁止 with，但允许 eval；直接与间接 eval 的作用域行为不同，通常不用于应用设计。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Execution_model'],
          ],
        },
      },
      {
        type: 'choice',
        q: '说说 ES6 的 Map/Set 和普通对象/数组的区别？WeakMap/WeakSet 有什么特殊？',
        options: [
          '对象属性键可以直接保存任意对象身份',
          'Map 支持任意值键，Set 去重；弱集合弱持有可回收键/成员且不可枚举',
          'WeakMap 有稳定的 size 可读取',
          '对象属性键只能是字符串，不能是 Symbol',
        ],
        answer: 1,
        explain:
          'Map 保存键值映射，键可为任意值，按插入顺序迭代并有 size；普通对象的属性键是字符串或 Symbol，还涉及原型与属性描述符。Set 保存不重复的值，数组保留索引位置并允许重复。WeakMap/WeakSet 弱持有可回收的键或成员，不提供枚举和 size，以免暴露不可预测的 GC 状态。',
        detail: {
          example:
            'Map 可用某个 DOM 节点作键保存元数据；如果希望映射本身不使节点存活，可用 WeakMap。现代规范也允许非注册 Symbol 作为弱集合键/成员；Symbol.for 返回的注册 Symbol 不适用，要考虑目标环境兼容。',
          pitfalls:
            'WeakMap 的值不会自动被弱引用。Map/Set 对对象按身份比较，两个内容相同的字面量是不同键。无法依据“Map 比对象快”做无条件选型，应比较访问模式与数据规模。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap',
            ],
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map'],
          ],
        },
      },
      {
        type: 'choice',
        q: 'Proxy 和 Reflect 是什么？Vue3 用 Proxy 实现响应式比 Object.defineProperty 好在哪？',
        options: [
          'Proxy 只能拦截一个已经存在的属性',
          'Proxy 拦截对象操作，Reflect 可转发操作；Vue 3 可借此处理属性读取、新增、删除等依赖变化',
          'Reflect 就是执行所有 Proxy trap 的语法糖',
          'Proxy 在任何场景都比访问器更快',
        ],
        answer: 1,
        explain:
          'Proxy 为目标对象创建代理，可拦截读取、写入、删除、属性枚举等操作；Reflect 提供相应对象内部操作的函数形式，适合在 trap 中转发。Vue 3 可在读取时收集依赖、写入时触发更新，拦截新增和删除，避免像逐个 defineProperty 那样必须预先为每个属性安装访问器。',
        detail: {
          code: "const target = {n: 1};\nconst proxy = new Proxy(target, {\n  get(t, key, receiver) {\n    console.log('读取', key);\n    return Reflect.get(t, key, receiver);\n  },\n  set(t, key, value, receiver) {\n    return Reflect.set(t, key, value, receiver);\n  }\n});\nproxy.n = 2; console.log(proxy.n);",
          pitfalls:
            'Reflect.get 的 receiver 影响 getter 中的 this。Proxy 不是自动深代理，Vue 按自身规则处理嵌套数据与集合；直接改原对象可能绕过代理。也不能保证 Proxy 在所有操作上性能更好。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy'],
            ['Vue · Reactivity in depth', 'https://vuejs.org/guide/extras/reactivity-in-depth.html'],
          ],
        },
        chain: 'vue',
      },
      {
        type: 'choice',
        q: 'Generator 函数和 async/await 的关系？Generator 怎么实现自动执行？',
        options: [
          'Generator 和 async/await 没有任何关系',
          'Generator 用 yield 暂停并由 next/throw 恢复；执行器可以驱动它等待 Promise，从而模拟某些 async/await 控制流程',
          'Generator 可以自动执行不需要 next()',
          'async/await 是 Generator 的替代品没有关系',
        ],
        answer: 1,
        explain:
          'Generator 调用后返回迭代器，用 next(value) 恢复暂停的 yield；也可用 throw(error) 将异常送回暂停点。自动执行器不断推进迭代器：等待本次 yield 的值，成功传给 next，失败传给 throw，遇到 done 后解决外层 Promise。它可以演示 async/await 的控制流，但两者有各自的语言语义。',
        detail: {
          code: "function run(gen, ...args) {\n  return new Promise((resolve, reject) => {\n    const it = gen(...args);\n    function step(method, value) {\n      let r;\n      try { r = it[method](value); } catch (e) { reject(e); return; }\n      if (r.done) { resolve(r.value); return; }\n      Promise.resolve(r.value).then(\n        v => step('next', v), e => step('throw', e));\n    }\n    step('next');\n  });\n}\nrun(function* () {\n  const n = yield Promise.resolve(2);\n  return n + 1;\n}).then(console.log); // 3",
          pitfalls:
            '需要捕获迭代器推进时的同步抛错，并处理普通值与 thenable。这个执行器没有主动取消、异步迭代器协议或资源预算；await 的并发策略也需要由业务明确。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*'],
          ],
        },
        chain: 'lang-generator-close',
      },
      {
        type: 'choice',
        q: '说说 JavaScript 的模块化历程？CommonJS/AMD/UMD/ESM 的区别？',
        options: [
          '只有 ESM 一种模块方案',
          'CommonJS 用 require/module.exports；AMD 异步定义依赖；UMD 适配多种加载环境；ESM 提供标准模块语法与实时绑定',
          'AMD 是 ECMAScript 规范中的同步加载器',
          '所有 CommonJS 的依赖都能在不执行代码时完整静态确定',
        ],
        answer: 1,
        explain:
          'CommonJS 用 require/module.exports，在 Node 中通常按需同步执行模块并缓存导出；AMD 用依赖声明与回调适应浏览器异步加载；UMD 是检测宿主后兼容多种加载方式的包装约定；ESM 使用标准 import/export，静态声明便于建立依赖图，导入绑定可实时观察导出方的重新赋值，也支持动态 import。',
        detail: {
          example:
            'CommonJS require 得到导出值，对象值仍是共享对象引用：exports.state={n:1} 后，消费者修改 state.n 可以被其他消费者看到；而重新给 module.exports 赋新对象，不会替换消费者早先保存的旧引用。ESM 的 export let n 与命名导入则是绑定关系。',
          pitfalls:
            '不能把 CommonJS 简化成“深拷贝”，也不能把 ESM 简化成“所有加载都发生在编译期”。循环依赖、顶层 await 和 CJS/ESM 互操作受宿主、版本与求值时机影响；tree shaking 还要考虑副作用。',
          sources: [
            ['Node · CommonJS', 'https://nodejs.org/api/modules.html'],
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules'],
          ],
        },
        chain: 'lang-esm-cycle',
      },
      {
        type: 'truefalse',
        q: '每次调用 Symbol() 都产生不同的值；Symbol.for() 则可能返回相同的 Symbol。',
        answer: true,
        explain:
          'Symbol 是原始类型。每次调用 Symbol(description) 都会创建不同的 Symbol，即使 description 相同；Symbol.for(key) 会查找共享注册表，同一 key 可返回同一个值。Symbol 键不会出现在 Object.keys 中，但可通过 Reflect.ownKeys 或 Object.getOwnPropertySymbols 取得，因此并不是真正私有属性。',
        detail: {
          code: "console.log(Symbol('x') === Symbol('x')); // false\nconsole.log(Symbol.for('x') === Symbol.for('x')); // true\nconst key = Symbol('id'), o = {[key]: 1};\nconsole.log(Object.keys(o).length, Reflect.ownKeys(o).length); // 0 1",
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Symbol',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: '箭头函数没有 arguments、super、new.target 绑定。',
        answer: true,
        explain:
          '正确。箭头函数没有自己的 this、arguments、super 或 new.target 绑定，这些名字在语法允许的位置按外层词法环境解析；需要独立参数列表时使用剩余参数 ...args。箭头函数不可构造，也没有供构造实例使用的 prototype 属性。',
        detail: {
          code: 'function outer(a) {\n  const read = () => arguments[0];\n  return read(99);\n}\nconsole.log(outer(7)); // 7：读取 outer 的 arguments\nconst own = (...args) => args[0];\nconsole.log(own(99)); // 99',
          pitfalls:
            '外层没有合法的 super/new.target 上下文时，箭头函数不能凭空使它们可用。对象字面量中的箭头属性也不会自动把对象作为 this。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions',
            ],
          ],
        },
      },
    ],
  },
  {
    id: 10,
    name: '设计模式殿堂',
    desc: '前端常用设计模式与实战',
    difficulty: 'medium',
    icon: '🏗️',
    questions: [
      {
        type: 'choice',
        q: '单例模式是什么？在前端中有什么应用？怎么实现？',
        options: [
          '单例意味着整个程序只能有一个变量',
          '在指定作用域中缓存并复用同一实例，如应用日志服务；可用闭包或模块保存实例并提供统一入口',
          '服务端所有用户状态都适合放在进程级单例中',
          '调用 new 就自动保证单例',
        ],
        answer: 1,
        explain:
          '单例控制某一作用域内只有一个实例，并提供重复获取同一实例的入口。前端可用于同一应用的日志服务、全局通知容器或连接管理器。最简单的实现是把实例保存在闭包或模块中，第一次访问时创建，之后复用；作用域必须说清是单个应用、浏览器标签页还是服务端请求。',
        detail: {
          code: 'function createLoggerSingleton() {\n  let instance;\n  return () => {\n    if (!instance) instance = { log: message => console.log(message) };\n    return instance;\n  };\n}\nconst getLogger = createLoggerSingleton();\nconsole.log(getLogger() === getLogger()); // true',
          pitfalls:
            '单例会引入共享状态与测试隔离问题。SSR 中把用户状态放进进程全局单例可能串用户；Pinia/Vuex 的应用级 store 也不能简化成“整个运行环境只能有一个实例”。',
          sources: [
            ['MDN 官方文档', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures'],
          ],
        },
      },
      {
        type: 'choice',
        q: '观察者模式和发布订阅模式的区别？',
        options: [
          '发布订阅一定异步，观察者一定同步',
          '观察者由目标登记并通知观察者；发布订阅通常经事件中心按主题交换消息，区别在依赖组织',
          '两者都不需要管理取消订阅',
          '使用 EventEmitter 就能自动保证业务消息可靠交付',
        ],
        answer: 1,
        explain:
          '观察者模型中，被观察对象直接登记并通知观察者；发布订阅通常引入事件中心或消息代理，发布者按主题发送，订阅者按主题接收，双方不必持有对方实例。区别主要是依赖的组织方式，而不是哪一个必定异步或性能更好。',
        detail: {
          example:
            '表单模型保存一组观察函数并在字段变化时逐个调用，是观察者结构；模块向共享 eventBus.emit("saved", id) 发送消息，其他模块事先 on("saved", handler)，是发布订阅结构。',
          pitfalls:
            'EventEmitter 可以在不同架构里扮演不同角色。不能仅看用了 Vue 自定义事件或某个类名就给整个系统定型；总线仍共享事件名与载荷契约，并需处理退订、错误和顺序。',
          sources: [['Node.js · EventEmitter', 'https://nodejs.org/api/events.html']],
        },
        chain: 'events',
      },
      {
        type: 'choice',
        q: '策略模式是什么？在前端中怎么应用？',
        options: [
          '策略模式要求删除程序中所有条件判断',
          '把可替换算法封装为统一契约下的函数或对象，入口选择后由业务调用，例如表单校验与上传通道',
          '策略必须使用继承且只能在服务端实现',
          '不同策略可以随意改变成功含义而不影响调用方',
        ],
        answer: 1,
        explain:
          '策略模式把可以互换的行为放在统一契约后，由调用方选择策略。前端可把不同上传渠道、校验规则或价格计算分开实现，使页面不必知道每种算法细节。它减少散落的条件分支，但策略选择和输入校验仍然需要明确逻辑。',
        detail: {
          code: 'const validators = {\n  required: value => value != null && String(value).trim() ? null : "必填",\n  positive: value => Number.isFinite(Number(value)) && Number(value) > 0 ? null : "必须是大于 0 的有限数"\n};\nfunction validate(value, ruleNames) {\n  return ruleNames.map(name => {\n    if (!Object.hasOwn(validators, name)) throw Error("未知规则: " + name);\n    return validators[name](value);\n  }).filter(Boolean);\n}',
          pitfalls:
            '只有名称相似而输入、失败语义和完成条件不同的行为，不应强行塞进同一策略接口。新增规则是否无需改调用方，要由实际契约和回归测试证明。',
          sources: [
            ['MDN 官方文档', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions'],
          ],
        },
        chain: 'strategy',
      },
      {
        type: 'choice',
        q: '代理模式在前端中的应用？和装饰器模式有什么区别？',
        options: [
          '只要写了包装函数就必然是同一种设计模式',
          '代理重点控制访问，装饰器重点组合附加职责；代码结构可相似，需要按意图判断',
          '装饰器只能拒绝访问，不能添加日志或计时',
          '代理只能读取，不能拦截写入或缓存结果',
        ],
        answer: 1,
        explain:
          '代理控制访问对象的方式，例如延迟初始化、权限检查、缓存和远程调用；装饰器在保留原接口的基础上增加职责，例如计时或日志。两者实现都可能是包装对象，区分应看意图。JavaScript 的 Proxy 是实现拦截的一种语言机制，不能据此认定所有 Proxy 都实现相同设计模式。',
        detail: {
          code: 'function withTiming(fn) {\n  return function (...args) {\n    const start = performance.now();\n    try { return fn.apply(this, args); }\n    finally { console.log(performance.now() - start); }\n  };\n} // 此例测量同步调用；异步完成耗时需等待返回的 Promise',
          example:
            '预览服务代理先校验授权再转发请求；日志装饰器记录一次调用耗时。缓存代理还须定义缓存键、有效期与失效规则，否则接口相同却可能返回错误结果。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '工厂模式是什么？在前端中有什么实际应用？',
        options: [
          '工厂模式就是 new 一个对象',
          '封装对象的创建过程调用者不关心具体类；简单工厂(一个工厂方法) 工厂方法(子类决定创建) 抽象工厂(创建产品族)；前端：React.createElement Vue 的 h() 创建虚拟 DOM',
          '工厂模式只能创建一种对象',
          '工厂模式和单例模式一样',
        ],
        answer: 1,
        explain:
          '工厂把“根据配置构造合适对象”的决策集中起来，让调用方依赖共同接口。前端可根据上传渠道创建适配器，或根据弹窗类型创建对应控制器。简单工厂通常是一个选择函数；工厂方法把创建决策交给子类；抽象工厂提供一组相互配套的产品。',
        detail: {
          code: 'function createUploader(kind, dependencies) {\n  const factories = {\n    gateway: deps => ({ upload: file => deps.sendToGateway(file) }),\n    direct: deps => ({ upload: file => deps.sendDirectly(file) })\n  };\n  if (!Object.hasOwn(factories, kind)) throw Error("不支持的上传渠道");\n  return factories[kind](dependencies);\n}',
          pitfalls:
            'React.createElement、Vue h 是创建元素描述的函数例子，不意味着每个工厂都应创建真实组件实例。若只有一种简单对象且没有变化点，额外工厂层可能没有收益。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/createElement']],
        },
      },
      {
        type: 'choice',
        q: '装饰器模式是什么？它和 @decorator 语法有什么关系，前端如何应用？',
        options: [
          '装饰器只是在代码旁边增加注释',
          '模式通过包装增加职责；@decorator 是具体语法，须区分工具链语义，可用于日志、计时等',
          '所有 @decorator 写法都是 ES7 正式标准且语义相同',
          '只有使用 @ 语法才能为函数增加日志',
        ],
        answer: 1,
        explain:
          '装饰器模式通过包装为对象或函数增加职责，例如日志、计时和权限验证，同时尽量保持调用契约。@decorator 是具体语言/工具链的装饰器语法，与设计模式不是同一个层次。“ES7 装饰器”是不准确的统称；TypeScript 传统实验装饰器与较新的标准提案语义也有差异，必须说明项目配置。',
        detail: {
          code: 'function withAuth(fn, canRun) {\n  return function (...args) {\n    if (!canRun()) throw Error("没有操作权限");\n    return fn.apply(this, args);\n  };\n} // 普通函数包装即可表达装饰器意图，不要求 @ 语法',
          example:
            '高阶组件 withPermission(Component) 可在渲染前增加展示逻辑；服务端操作仍需独立授权。类方法装饰器的参数、返回值和可装饰目标要按实际编译器语义编写。',
          pitfalls:
            '包装要保留 this、参数、返回值和异常契约。不能把旧版 experimentalDecorators 示例直接当成所有工具链支持的标准写法。',
          sources: [
            [
              'TypeScript · 5.0 装饰器语义',
              'https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#decorators',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: 'Vue3 的 reactive 本质上是代理模式（Proxy）的应用。',
        answer: true,
        explain:
          '正确。Vue 3 的 reactive 使用 Proxy 拦截普通对象的操作：读取可收集依赖，写入或删除可通知相关 effect。代理仍会把写入转交给目标对象，因此“采用代理”不等于原对象内容从不变化。直接绕过代理操作原始对象不会走相同的跟踪路径。',
        detail: {
          code: 'const raw = { count: 0 };\nconst state = reactive(raw);\nstate.count++;\nconsole.log(raw.count); // 1：写入最终作用于目标\nconsole.log(state === raw); // false',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/extras/reactivity-in-depth.html']],
        },
        chain: 'vue',
      },
      {
        type: 'truefalse',
        q: '发布订阅模式中，发布者和订阅者之间有直接依赖关系。',
        answer: false,
        explain:
          '错误。典型发布订阅通过主题或事件中心关联双方，发布者不必直接引用具体订阅者。但系统仍依赖事件名称、数据格式与时序契约；改变载荷也可能破坏消费者。解耦对象引用不等于消除所有依赖。',
        detail: {
          example:
            '上传模块发布 {type:"file-ready", fileId, version}，列表与通知模块分别订阅。生产者无需调用两个模块，但双方仍要约定 ready 是否代表“字节已收齐”还是“文件已可下载”。',
          sources: [['Node.js · EventEmitter', 'https://nodejs.org/api/events.html']],
        },
        chain: 'events',
      },
      {
        type: 'choice',
        q: '迭代器模式是什么？ES6 中如何实现？',
        options: [
          '所有有 length 的对象都自动可以 for...of',
          '可迭代对象提供 Symbol.iterator，返回有 next 的迭代器；for...of、数组展开及数组解构消费它',
          '对象展开 {...obj} 与 for...of 使用完全相同的遍历协议',
          '迭代器不能表示按需生成的数据',
        ],
        answer: 1,
        explain:
          '迭代器提供逐项取得集合内容的统一协议。JavaScript 的可迭代对象实现 Symbol.iterator 方法，调用后返回具有 next() 的迭代器；next 返回 {value,done}。for...of、数组/调用参数中的展开、数组解构等按这个协议消费值。对象展开 {...obj} 则读取属性，不使用迭代器协议。',
        detail: {
          code: 'function range(start, end) {\n  return {\n    [Symbol.iterator]() {\n      let value = start;\n      return { next() {\n        return value < end ? {value: value++, done: false} : {done: true};\n      }};\n    }\n  };\n}\nconsole.log([...range(2, 5)]); // [2, 3, 4]',
          pitfalls:
            '可迭代对象与迭代器不是同义词。需要可重复遍历时，每次 Symbol.iterator 应创建独立进度；持有资源的迭代器可实现 return 处理提前结束，Generator 的 finally 可承担清理。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols',
            ],
          ],
        },
      },
    ],
  },
  {
    id: 11,
    name: '手写代码竞技场',
    desc: '高频手写实现题',
    difficulty: 'hard',
    icon: '✍️',
    questions: [
      {
        type: 'choice',
        q: '手写防抖(debounce)函数？说说原理和应用场景。',
        options: [
          '防抖就是让函数延迟执行一次',
          '尾沿防抖跨调用保存 timer，每次重置计时，静默 wait 后用末次 this 与参数执行；可提供 cancel',
          '防抖和节流是同一个东西',
          '防抖函数没有参数',
        ],
        answer: 1,
        explain:
          '尾沿防抖把一次执行推迟到最后一次调用之后 wait 毫秒；新调用先清除旧定时器，再以最后一次 this 和参数安排执行。适合输入搜索、窗口尺寸稳定后计算等场景。下面保留调用接收者并提供 cancel，卸载时可停止未执行任务。',
        detail: {
          code: 'function debounce(fn, wait) {\n  let timer;\n  function wrapped(...args) {\n    clearTimeout(timer);\n    timer = setTimeout(() => {\n      timer = undefined;\n      fn.apply(this, args);\n    }, wait);\n  }\n  wrapped.cancel = () => {\n    clearTimeout(timer); timer = undefined;\n  };\n  return wrapped;\n}',
          example:
            'wait=100 时在 0ms、60ms 调用，正常调度下只执行最后一次，最早在 160ms 左右；定时器延迟不保证精确。用虚拟时钟验证末次参数、this、cancel 与两个独立实例。',
          pitfalls:
            '持续输入会持续推迟，若要求最长等待需增加 maxWait。防抖不解决已发请求乱序，仍须请求代际校验。此版本不承诺返回原函数的异步结果。',
          sources: [['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures']],
        },
        chain: 'debounce',
      },
      {
        type: 'choice',
        q: '手写节流(throttle)函数？和防抖的区别？',
        options: [
          '节流就是让函数只执行一次',
          '节流限制持续触发时的执行频率，需约定首尾行为；防抖等待静默期，持续触发可能一直推迟',
          '节流和防抖完全一样',
          '节流函数不能传参数',
        ],
        answer: 1,
        explain:
          '节流限制连续调用期间的执行频率；防抖等待一段静默期。下面约定首调用立即执行，窗口中只保留最后一次调用作为尾调用；尾调用执行后开启新窗口。它适合滚动状态采样，具体是否保留首尾要在编码前确认。',
        detail: {
          code: 'function throttle(fn, wait) {\n  let timer = null, pending = null;\n  function flush() {\n    if (!pending) { timer = null; return; }\n    const [ctx, args] = pending; pending = null;\n    timer = setTimeout(flush, wait);\n    fn.apply(ctx, args);\n  }\n  function wrapped(...args) {\n    if (timer === null) {\n      timer = setTimeout(flush, wait);\n      fn.apply(this, args);\n    } else pending = [this, args];\n  }\n  wrapped.cancel = () => {\n    clearTimeout(timer); timer = null; pending = null;\n  };\n  return wrapped;\n}',
          example:
            'wait=100，在 0、30、60ms 调用，0ms 执行第一次，100ms 执行 60ms 的参数。单次调用没有额外尾调用。cancel 清除窗口与等待参数，下一次可立即执行。',
          pitfalls:
            '这是窗口式实现，不保证浏览器后台或主线程阻塞时的精确时间；用虚拟时钟验首尾、取消、this 和重入行为。UI 帧级更新也可考虑 requestAnimationFrame，但它不是固定毫秒节流。',
          sources: [
            ['MDN · setTimeout', 'https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout'],
          ],
        },
        chain: 'debounce',
      },
      {
        type: 'choice',
        q: '手写深拷贝？处理循环引用和特殊类型？',
        options: [
          'JSON.parse(JSON.stringify()) 就够了',
          '先约定类型范围，用映射保存原对象到副本，递归前登记以保留循环和共享引用，再按类型及描述符复制',
          '深拷贝不需要处理循环引用',
          'Object.assign 是深拷贝',
        ],
        answer: 1,
        explain:
          '先约定支持普通对象、数组、Date、RegExp、Map、Set；函数保留引用，其他实例拒绝处理。先创建副本并记入 seen，再复制子节点，才能同时保留循环与共享引用。属性用描述符复制可保留 Symbol、不可枚举字段与访问器定义，避免读取 getter。',
        detail: {
          code: "function clone(value, seen = new WeakMap()) {\n  if (value === null || typeof value !== 'object') return value;\n  if (seen.has(value)) return seen.get(value);\n  let out;\n  if (Array.isArray(value)) out = [];\n  else if (value instanceof Date) out = new Date(value.getTime());\n  else if (value instanceof RegExp) out = new RegExp(value.source, value.flags);\n  else if (value instanceof Map) out = new Map();\n  else if (value instanceof Set) out = new Set();\n  else {\n    const proto = Object.getPrototypeOf(value);\n    if (proto !== Object.prototype && proto !== null) throw TypeError('unsupported');\n    out = Object.create(proto);\n  }\n  seen.set(value, out);\n  if (value instanceof Map) {\n    for (const [k,v] of value) out.set(clone(k,seen),clone(v,seen));\n  }\n  if (value instanceof Set) for (const v of value) out.add(clone(v,seen));\n  for (const key of Reflect.ownKeys(value)) {\n    const d = Object.getOwnPropertyDescriptor(value,key);\n    if ('value' in d) d.value = clone(d.value,seen);\n    Object.defineProperty(out,key,d);\n  }\n  return out;\n}",
          example:
            '令 a.self=a，且 a.left 与 a.right 指向同一对象；副本应满足 copy.self===copy、copy.left===copy.right、copy.left!==a.left。再测 Map 以自身为键、稀疏数组、getter 未执行、RegExp.lastIndex。',
          pitfalls:
            '这个教学契约限定同一 realm 的受支持对象；不处理 Proxy 特殊行为、TypedArray、WeakMap、DOM 或自定义私有字段。复制访问器函数本身不会重建它闭包里的状态。通用数据传递可先考虑 structuredClone。属性描述符遍历本身不读取普通 getter；此演示的类型分支假定 Date/RegExp/Map/Set 的内置访问器、方法及迭代器未被覆盖。若允许重写它们，须改用对应原生原型方法直接读取内部槽，不能承诺复制过程没有用户代码副作用。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptors',
            ],
            [
              'MDN · structured clone',
              'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm',
            ],
          ],
        },
        chain: 'lang-structured-clone',
      },
      {
        type: 'choice',
        q: '手写 Promise.all？说说原理和边界处理。',
        options: [
          'Promise.all 就是循环调用 then',
          '遍历输入，用 Promise.resolve 处理每项，按输入下标保存结果；全部兑现才成功，任一拒绝则失败，空可迭代对象得到空结果',
          'Promise.all 是串行执行',
          'Promise.all 顺序执行每个 Promise',
        ],
        answer: 1,
        explain:
          'all 的关键是按输入位置收集结果与完成计数。每项先用 Promise.resolve 采用普通值、Promise 或 thenable；全部兑现时返回数组，任一拒绝则拒绝。下面是有限可迭代对象的教学实现，先展开到数组；它不覆盖原生 Promise 子类构造器等全部规范扩展点。',
        detail: {
          code: 'function all(iterable) {\n  return new Promise((resolve, reject) => {\n    const items = [...iterable]; // 迭代失败由 Promise 构造器转为拒绝\n    const out = new Array(items.length);\n    let remaining = items.length;\n    if (remaining === 0) { resolve([]); return; }\n    items.forEach((item, index) => {\n      Promise.resolve(item).then(value => {\n        out[index] = value;\n        if (--remaining === 0) resolve(out);\n      }, reject);\n    });\n  });\n}',
          example:
            '先将 Array(2) 迭代成含两个 undefined 的稠密数组，避免 forEach 跳空槽而永不完成。逆序完成仍按原位置写 out；空输入直接 resolve([])，then 仍异步。',
          pitfalls:
            '拒绝组合 Promise 不会取消其他任务；未结算项可使整体一直等待。测试空数组、稀疏数组、Set、普通值、逆序、拒绝、非法输入及抛错迭代器。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all',
            ],
          ],
        },
        chain: 'lang-all-boundaries',
      },
      {
        type: 'choice',
        q: '手写一个简易的发布订阅(EventEmitter)？',
        options: [
          '就是一个数组存函数',
          'Map 保存事件订阅集合；on 返回退订函数，emit 按快照通知，once 在调用前退订以处理重入',
          '所有监听器都不需要取消订阅',
          'emit 只能通知一个订阅者',
        ],
        answer: 1,
        explain:
          '用 Map 管理事件名到订阅集合，on 注册并返回退订函数，emit 按本次快照通知，once 在调用前设置已执行标记并退订，防止嵌套 emit 的内外两份快照重复调用。下面约定同一函数可重复注册为不同订阅；监听器抛错会终止本次 emit，是否改为隔离错误需要另外声明。',
        detail: {
          code: 'class Emitter {\n  constructor() { this.events = new Map(); }\n  on(type, fn) {\n    const record = {fn};\n    const set = this.events.get(type) || new Set();\n    this.events.set(type,set); set.add(record);\n    return () => {\n      set.delete(record);\n      if (!set.size && this.events.get(type) === set) this.events.delete(type);\n    };\n  }\n  once(type, fn) {\n    let fired = false;\n    const off = this.on(type,(...args) => {\n      if (fired) return;\n      fired = true; off(); fn(...args);\n    });\n    return off;\n  }\n  emit(type, ...args) {\n    for (const {fn} of [...(this.events.get(type) || [])]) fn(...args);\n  }\n}',
          example:
            'A 监听器执行时新订阅 B，B 不进入本次快照；once 的回调再次 emit 同名事件时也不会再次调用自己。取消后要清理空事件集合，避免事件名长期积累。若排在 once 前的监听器递归 emit，内层会先触发 once；外层旧快照仍有包装函数，因此还必须由 fired 标记阻止第二次执行。',
          pitfalls:
            '快照语义下，本轮中途退订的另一个监听器仍可能在本轮被调用，下一轮才消失。事件总线不是状态仓库；需要追踪事件来源和组件卸载时的退订。',
          sources: [['Node · EventEmitter（语义对照）', 'https://nodejs.org/api/events.html']],
        },
        chain: 'events',
      },
      {
        type: 'choice',
        q: '手写实现 call/apply/bind？',
        options: [
          '这三个不能手动实现',
          'call/apply 调用时指定接收者与参数；bind 返回可延后调用的绑定函数，完整语义还涉及部分参数和构造调用',
          'bind 和 call 实现方式完全一样',
          'apply 不能传数组参数',
        ],
        answer: 1,
        explain:
          'call/apply 的核心是用给定接收者及参数执行目标；引擎级 this 语义可借 Reflect.apply 表达。bind 还要保存预置参数，并区分普通调用与构造调用。下面给出这些行为的包装实现，不改 Function.prototype，也不声称完整复刻原生绑定函数的所有元数据和内部槽。',
        detail: {
          code: "function callLike(fn, ctx, ...args) { return Reflect.apply(fn, ctx, args); }\nfunction applyLike(fn, ctx, args) {\n  return Reflect.apply(fn, ctx, args == null ? [] : args);\n}\nfunction bindLike(fn, ctx, ...preset) {\n  if (typeof fn !== 'function') throw TypeError('fn');\n  function Bound(...later) {\n    const args = [...preset, ...later];\n    if (new.target) return Reflect.construct(fn, args, new.target === Bound ? fn : new.target);\n    return Reflect.apply(fn, ctx, args);\n  }\n  Object.defineProperty(Bound, Symbol.hasInstance, {value: obj => obj instanceof fn});\n  return Bound;\n}",
          example:
            'function Item(x){this.x=x}；bindLike(Item,{x:0},5) 后 new Bound(8) 得到 x=5 的 Item 实例，绑定接收者被忽略，预置参数仍生效。普通调用可保留严格函数的 null/undefined 接收者。',
          pitfalls:
            '临时把函数挂到 ctx 上再调用仅适合受限演示：冻结对象、原始值、访问器、副作用及严格模式 this 都会破坏等价性。此包装未模拟原生 name/length、无自有 prototype、继承等全部行为；若禁止 Reflect，先确认缩小后的实现范围。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/bind',
            ],
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Reflect/apply',
            ],
          ],
        },
        chain: 'lang-bind-new',
      },
      {
        type: 'choice',
        q: '手写 Promise（A+ 规范核心）？关键状态管理？',
        options: [
          'Promise 就是一个回调队列',
          '终态不可变，then 异步调用处理器并返回新 Promise，采用回调返回的 thenable，抛错或链式自引用使新 Promise 拒绝',
          'Promise 状态可以反复改变',
          'then 不返回 Promise',
        ],
        answer: 1,
        explain:
          'A+ 核心是 then 的可互操作行为：终态不可变、回调异步、注册顺序保留、then 返回新 Promise、返回值经过解析过程。解析 thenable 时只读取一次 then，并用一次性开关防止重复回调；回调抛错要拒绝新 Promise，返回新 Promise 自己要拒绝循环。下面实现这些核心路径。',
        detail: {
          code: "class MiniPromise {\n  constructor(executor) {\n    this.state = 'pending'; this.value = undefined; this.jobs = [];\n    let locked = false;\n    const resolve = x => {\n      if (locked) return; locked = true; this.adopt(x);\n    };\n    const reject = e => {\n      if (locked) return; locked = true; this.settle('rejected', e);\n    };\n    try { executor(resolve, reject); } catch (e) { reject(e); }\n  }\n  settle(state, value) {\n    if (this.state !== 'pending') return;\n    this.state = state; this.value = value;\n    for (const job of this.jobs) queueMicrotask(job);\n    this.jobs = [];\n  }\n  adopt(x) {\n    if (x === this) { this.settle('rejected', new TypeError('cycle')); return; }\n    if (x !== null && (typeof x === 'object' || typeof x === 'function')) {\n      let then;\n      try { then = x.then; } catch (e) { this.settle('rejected', e); return; }\n      if (typeof then === 'function') {\n        let called = false;\n        try {\n          then.call(x,\n            y => { if (!called) { called = true; this.adopt(y); } },\n            e => { if (!called) { called = true; this.settle('rejected', e); } });\n        } catch (e) { if (!called) { called = true; this.settle('rejected', e); } }\n        return;\n      }\n    }\n    this.settle('fulfilled', x);\n  }\n  then(onFulfilled, onRejected) {\n    return new MiniPromise((resolve, reject) => {\n      const job = () => {\n        const handler = this.state === 'fulfilled' ? onFulfilled : onRejected;\n        if (typeof handler !== 'function') {\n          (this.state === 'fulfilled' ? resolve : reject)(this.value); return;\n        }\n        try { resolve(handler(this.value)); } catch (e) { reject(e); }\n      };\n      if (this.state === 'pending') this.jobs.push(job);\n      else queueMicrotask(job);\n    });\n  }\n}",
          example:
            'new MiniPromise(r=>r(2)).then(x=>x+1) 得到 3；没有成功回调时值穿透，没有拒绝回调时错误继续传播。then 回调返回 thenable 时采用它的状态；then getter 抛错时拒绝。构造器 resolve 一个等待中的 thenable 后，再 reject 不能抢先改变其命运。',
          pitfalls:
            'A+ 主要规范 then，并非原生 Promise 的完整标准。这里不实现 finally、静态组合方法、物种构造、宿主未处理拒绝跟踪或对恶意无限 thenable 链的资源预算。要用兼容测试验证，不能仅凭成功案例说符合规范。',
          sources: [['Promises/A+', 'https://promisesaplus.com/']],
        },
        chain: 'lang-resolution',
      },
      {
        type: 'truefalse',
        q: '尾沿防抖需要跨调用保留定时器标识，闭包是常见的实现方式。',
        answer: true,
        explain:
          '尾沿防抖需要在多次调用之间保存同一个 timer 标识，闭包是常见实现方式：定时器变量放在创建包装函数的外层，每次调用共享它。若放在包装函数内部，每次都会初始化，无法清掉上一次定时器。',
        detail: {
          example:
            '两次分别调用 debounce(fn,100) 会创建两个独立闭包，互不取消。也可以把 timer 存在实例字段中，因此“跨调用保存状态”是必要条件，“只能用闭包”并不成立。',
          sources: [['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Closures']],
        },
        chain: 'debounce',
      },
      {
        type: 'truefalse',
        q: '手写深拷贝时用 Map 来记录已拷贝的对象处理循环引用比 WeakMap 更好。',
        answer: false,
        explain:
          '不能笼统说 Map 更好。Map 与 WeakMap 都能记录原对象到副本的映射，解决循环和共享引用。若映射只存在于单次克隆调用，调用结束后整体可回收，使用 Map 并不会自动泄漏；若映射长期存在，WeakMap 的弱键语义可能更合适。',
        detail: {
          example:
            'clone 开始就创建 seen，并在递归前 seen.set(source,copy)。遇到同一 source 直接返回既有副本，这个算法关键与容器是否可枚举无关。',
          pitfalls:
            'WeakMap 不可枚举，也没有 size；若需要输出已克隆对象统计可选 Map 或单独计数。选择要依据映射生命周期和功能，而非“弱引用一定更快”。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakMap',
            ],
          ],
        },
      },
      {
        type: 'choice',
        chain: 'pool',
        q: '手写一个最多 k 个并发、按输入顺序返回结果的请求池。同时有多个请求在跑，第 3 项比第 1 项先完成，为什么结果还能保序？',
        options: [
          '靠 Promise.all 内部会自动排序',
          '领任务时记下输入下标 i，完成时写 out[i]，而不是 push',
          '先把所有请求串行执行一遍',
          '按完成时间给结果排序',
        ],
        answer: 1,
        explain:
          '保序的关键不在完成顺序，而在写入位置。共享游标让每个 worker 在第一次 await 之前同步领到一个下标 i，请求完成后把结果写进 out[i]。即使第 3 项先完成，它写的也是第 3 格，数组顺序天然就是输入顺序。',
        detail: {
          code: 'async function pool(urls, k, request) {\n  if (!Number.isInteger(k) || k < 1) throw RangeError(\'k\');\n  let next = 0, stopped = false;\n  const out = new Array(urls.length);\n  async function worker() {\n    while (!stopped && next < urls.length) {\n      const i = next++;                    // 同步领取，不会交叉\n      try { out[i] = await request(urls[i]); }   // 按下标写入\n      catch (e) { stopped = true; throw e; }\n    }\n  }\n  await Promise.all(Array.from({length: Math.min(k, urls.length)}, worker));\n  return out;\n}',
          example:
            '并发数 k=3，第 3 个请求先返回。用 push 会得到完成顺序，结果和输入对不上；用 out[i] 写入，第 3 个结果就稳稳待在第 3 格。领取下标这一步务必在 await 之前完成，同一 JS 线程里这段同步代码不会被打断，所以两个 worker 不会领到同一个 i。',
          pitfalls:
            '用 push 收集结果，是最常见的错误，得到的是完成顺序。把 next++ 放在 await 之后，两个 worker 可能领到同一个下标。一个请求失败时其他在途请求不会自动取消，stopped 只阻止后续领取；要真正终止需要共享 AbortController。验证并发上限不要用 sleep，用手动释放的 Promise 记录 active 的峰值。',
        },
      },
      {
        type: 'choice',
        chain: 'lru',
        q: '用 Map 实现容量为 2 的 LRU，依次写入 A、B，读取 A，再写入 C，最终应该淘汰谁？',
        options: ['A', 'B', 'C', '同时淘汰 A 和 B'],
        answer: 1,
        explain:
          'Map 保持插入顺序。写入 A、B 后顺序是 A、B；读取 A 时先删再插，顺序变成 B、A，A 成为最近使用；再写入 C 超出容量，淘汰最久未用的第一个键 B，最终保留 A、C。',
        detail: {
          code: 'function lru(cap) {\n  if (!Number.isInteger(cap) || cap < 1) throw RangeError(\'cap\');\n  const m = new Map();\n  return {\n    get(k) {\n      if (!m.has(k)) return;              // 用 has，避免把 0/false 当成未命中\n      const v = m.get(k);\n      m.delete(k); m.set(k, v);           // 删再插 = 刷新为最近使用\n      return v;\n    },\n    set(k, v) {\n      m.delete(k); m.set(k, v);\n      if (m.size > cap) m.delete(m.keys().next().value);  // 淘汰最旧的\n    },\n  };\n}',
          example:
            '容量 2：set A、set B（顺序 A,B）→ get A（顺序变 B,A）→ set C 触发淘汰，第一个键 B 被删掉，剩下 A,C。注意覆盖已有键时也要先 delete 再 set，否则那个键的位置不会更新为最近使用。',
          pitfalls:
            '用 get(k) 是否为 undefined 判断未命中，会把合法的 0、false、空字符串误判成没有。覆盖已有键时忘了先 delete，它的顺序不会刷新，淘汰逻辑就错了。只用键数限制容量，对大小差异很大的产物（比如预览文件）远远不够，还要按字节权重设上限。',
        },
      },
    ],
  },
  {
    id: 12,
    name: 'ES6+ 与 TS 进阶',
    desc: '现代JS特性与TypeScript深度',
    difficulty: 'hard',
    icon: '📘',
    questions: [
      {
        type: 'choice',
        q: 'ES6 的 Class 和构造函数有什么区别？extends 的本质？',
        options: [
          'Class 完全是新的东西和构造函数无关',
          'class 基于原型机制，并有严格模式、必须构造调用等语义；extends 连接实例原型和静态继承关系',
          'Class 不支持继承',
          'Class 的方法不在 prototype 上',
        ],
        answer: 1,
        explain:
          'class 仍建立在 JavaScript 原型机制上，但有明确语义：类必须通过构造调用使用，类体采用严格模式，原型方法通常不可枚举，类声明在初始化前处于 TDZ。extends 会建立子类原型到父类原型的关联，也连接构造器的静态继承关系；派生构造器使用 this 前必须先调用 super。',
        detail: {
          code: 'class Base {\n  constructor(n) { this.n = n; }\n  value() { return this.n; }\n  static kind() { return "base"; }\n}\nclass Child extends Base {\n  constructor(n) { super(n); this.extra = 1; }\n}\nconsole.log(new Child(3).value(), Child.kind()); // 3 base',
          pitfalls:
            'class 不只是可随意与函数替换的缩写：普通函数能直接调用，类不能；实例字段与原型方法的归属不同。super.method() 的接收者仍是当前实例。',
          sources: [['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes']],
        },
        chain: 'prototype',
      },
      {
        type: 'choice',
        q: '说说 TypeScript 的泛型？泛型约束是什么？',
        options: [
          '泛型就是 any 的别名',
          '泛型是类型的参数化<T>让类型可复用；泛型约束用 extends 限制类型范围(如<T extends {length:number}>)；keyof T 获取类型键的联合类型；T[K] 索引访问类型',
          '泛型只能用于函数',
          '泛型不能有约束',
        ],
        answer: 1,
        explain:
          '泛型用类型参数表达输入与输出之间的关系，既复用实现，也保留具体类型。约束 T extends X 表示 T 至少满足 X，而不是把结果永久变成 X。keyof 与索引访问类型可保证“选哪个键就得到哪个字段类型”，比 any 保留更多可检查的信息。',
        detail: {
          code: 'function get<T, K extends keyof T>(obj: T, key: K): T[K] {\n  return obj[key];\n}\nconst user = {id: 1, name: "Ye"};\nconst userName: string = get(user, "name");\n// @ts-expect-error: 不存在该键\nget(user, "age");',
          pitfalls:
            '运行时 URL 参数仍是未验证字符串，as keyof T 不会检查其存在。只出现一次、没有表达类型关系的泛型可能没有价值；类型约束也不生成接口输入验证。',
          sources: [['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/2/generics.html']],
        },
        chain: 'lang-generics-readonly',
      },
      {
        type: 'choice',
        q: 'TypeScript 的工具类型(Partial/Required/Pick/Omit/Record/Exclude/Extract)怎么用？',
        options: [
          '工具类型就是给类型起别名',
          'Partial<T> 全可选 Required<T> 全必选 Pick<T,K> 选取属性 Omit<T,K> 排除属性 Record<K,V> 键值对映射 Exclude<T,U> 排除联合类型成员 Extract<T,U> 保留成员',
          'Partial 和 Required 功能相同',
          'Record 只能用于数字键',
        ],
        answer: 1,
        explain:
          'Partial/Required 修改对象属性的可选性，Pick 选择键、Omit 排除键，Record 建立键集合到值类型的映射；这些通常只作用一层。Exclude/Extract 则处理联合类型成员：分别剔除或保留可赋给指定类型的成员，不能与删除对象字段混为一谈。',
        detail: {
          code: 'type User = {id: number; name: string; age?: number};\ntype Patch = Partial<User>;\ntype Complete = Required<User>;\ntype Brief = Pick<User, "id" | "name">;\ntype WithoutId = Omit<User, "id">;\ntype Flags = Record<"read" | "write", boolean>;\ntype A = Exclude<"a" | "b" | 1, string>; // 1\ntype B = Extract<"a" | "b" | 1, string>; // "a" | "b"',
          example:
            '编辑接口可用 Omit<Partial<User>,"id"> 描述可修改字段，但服务端仍要过滤字段、校验权限。Required 使 age 必填，与是否允许显式 undefined 还受原类型和编译选项影响。',
          sources: [
            ['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/utility-types.html'],
          ],
        },
      },
      {
        type: 'choice',
        q: 'TypeScript 的条件类型和 infer 关键字？',
        options: [
          '条件类型就是 if-else',
          'T extends U ? X : Y 条件类型根据类型关系选择；infer R 在条件类型中推断类型变量；常用于提取函数返回类型/参数类型/数组元素类型等类型体操',
          'infer 可以在普通类型中使用',
          '条件类型不支持嵌套',
        ],
        answer: 1,
        explain:
          '条件类型写作 T extends U ? X : Y，根据可赋值关系选分支；当被检查对象是裸类型参数 T 时，对联合输入常会分配到各成员。infer 在匹配位置声明待推断类型，例如抽取数组元素、函数返回值或 Promise 内部类型。',
        detail: {
          code: 'type Item<T> = T extends readonly (infer U)[] ? U : never;\ntype R = Item<readonly [1, "x"]>; // 1 | "x"\ntype Wrap<T> = T extends string ? {s: T} : {v: T};\ntype A = Wrap<string | number>; // {s:string} | {v:number}\ntype AllStrings<T> = [T] extends [string] ? true : false;\ntype B = AllStrings<string | number>; // false',
          pitfalls:
            '元组包装可阻止分配。never 和 any 在条件类型中有特别表现，要用编译断言验证；infer 属于类型运算，不会在运行时解析数据。',
          sources: [
            ['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/2/conditional-types.html'],
          ],
        },
        chain: 'lang-conditional',
      },
      {
        type: 'choice',
        q: 'TypeScript 中 interface 和 type 的区别？什么时候用哪个？',
        options: [
          '两者完全一样没有区别',
          'interface 支持对象契约的声明合并；type 能表达联合、元组、映射等类型，两者都可描述对象与函数',
          'type 支持声明合并',
          'interface 可以定义联合类型',
        ],
        answer: 1,
        explain:
          'interface 主要描述对象形状，支持 extends 和同名声明合并，适合需要开放扩展的公共对象契约。type 可以为对象、联合、元组、原始类型及复杂映射起别名，也能用交叉类型组合，但同名别名不能像 interface 那样重新声明合并。两者通常都能描述函数，也都参与结构类型检查。',
        detail: {
          code: 'interface Entity { id: string }\ninterface Entity { version: number } // 合并\ntype Result = {ok: true; value: Entity} | {ok: false; error: string};\nfunction read(r: Result) {\n  if (r.ok) return r.value.id;\n  return r.error;\n}',
          pitfalls:
            'interface extends 的属性冲突会较早报错；交叉类型中冲突字段可能变成 never。类型别名本身不创造名义类型或运行时构造器，选择还要遵循团队公共API风格。',
          sources: [
            ['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html'],
          ],
        },
      },
      {
        type: 'choice',
        q: '说说 TypeScript 的协变和逆变？函数参数类型兼容性？',
        options: [
          'TypeScript 没有协变逆变',
          'strictFunctionTypes 下普通函数参数按逆变方向检查，返回值可更具体；方法声明存在双变检查例外',
          '协变和逆变只出现在 Java 中',
          'TypeScript 的函数参数是协变的',
        ],
        answer: 1,
        explain:
          '协变表示输出位置随子类型关系变化；逆变表示输入位置反向约束。开启 strictFunctionTypes 时，普通函数类型的参数按更安全的逆变方向检查：能处理所有 Animal 的函数可用在只传 Dog 的位置，而只能处理 Dog 的函数不能被拿去接收任意 Animal。返回值可更具体。',
        detail: {
          code: 'interface Animal { name: string }\ninterface Dog extends Animal { bark(): void }\nlet animalFn: (x: Animal) => void = x => console.log(x.name);\nlet dogFn: (x: Dog) => void = x => x.bark();\ndogFn = animalFn; // 安全：调用者只传 Dog\n// @ts-expect-error: strictFunctionTypes 下不安全\nanimalFn = (x: Dog) => x.bark();',
          pitfalls:
            '方法声明为兼容某些常见模式有双变检查例外，不能推断所有回调都严格逆变。可变数组也有历史兼容折中；用 readonly 限制写入更容易表达安全契约。',
          sources: [
            ['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/type-compatibility.html'],
          ],
        },
      },
      {
        type: 'choice',
        q: 'ES6 的解构赋值有哪些用法？默认值怎么用？',
        options: [
          '解构只能用于数组',
          '数组解构按位置对象解构按属性名；默认值用 = 赋予(只在严格 undefined 时生效)；支持嵌套解构和剩余语法 ...rest；函数参数解构常用',
          '解构不能有默认值',
          '对象解构按位置',
        ],
        answer: 1,
        explain:
          '数组解构按迭代顺序取值，可跳过元素与收集剩余项；对象解构按属性名取值，可重命名、嵌套和收集剩余自有可枚举属性。默认值只在取得 undefined 时生效，null、0、false 都不会触发。解构声明和给既有变量赋值的语法也要区分。',
        detail: {
          code: 'const [first, , ...rest] = [1, 2, 3, 4];\nconst {name: label = "匿名", n = 10} = {name: undefined, n: null};\nconsole.log(first, rest, label, n); // 1 [3,4] 匿名 null\nlet x; ({x} = {x: 5}); // 对象解构赋值加括号',
          pitfalls:
            '解构 null/undefined 会抛错；嵌套字段缺失也可能失败。对象展开和解构会读取访问器；从响应式对象直接解构原始值可能丢失与源属性的更新关系。',
          sources: [
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Destructuring',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '模板字符串、标签模板怎么用？常见字符串扩展有哪些？',
        options: [
          '模板字符串就是字符串拼接',
          '模板字面量支持多行和插值，标签接收静态片段与插值；字符串扩展分属不同标准版本',
          '模板字符串不能多行',
          '标签模板没有实际用途',
        ],
        answer: 1,
        explain:
          '模板字面量支持多行文本与插值；标签模板把静态片段数组和插值值分别传给标签函数，由函数决定如何组合，返回值不必是字符串。字符串常见扩展包括 includes、startsWith、endsWith、repeat、padStart 等；查找与截取仍需明确 UTF-16 码元、码点或字素簇的口径。',
        detail: {
          code: 'function join(parts, ...values) {\n  return parts.reduce((s, part, i) => s + part + (i < values.length ? String(values[i]) : ""), "");\n}\nconst user = "Ye", count = 2;\nconsole.log(join`用户：${user}，数量：${count}`); // 用户：Ye，数量：2\nconsole.log("7".padStart(3, "0")); // 007',
          example:
            '模板字面量和 includes 等见于 ES2015，padStart/padEnd 见于后续版本。标签收到的 parts.raw 可获取未处理转义的原始片段；它可用于国际化或查询构造，安全性取决于正确实现。',
          pitfalls:
            '普通字符串插值或随意实现的 tag 不会自动转义 HTML 或防 SQL 注入。字符串长度不是用户看到的字符数量，emoji 截断需考虑字素簇。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals'],
          ],
        },
      },
      {
        type: 'truefalse',
        q: 'interface、type 别名与类型注解本身不会自动生成运行时数据校验。',
        answer: true,
        explain:
          '正确。interface、type 别名和大多数类型注解在编译后会被擦除，无法在运行时用 instanceof 某个 interface 检查接口响应。外部 JSON 应进行运行时校验，再让类型系统描述校验后的值。',
        detail: {
          pitfalls:
            'TypeScript 文件中也可以包含会生成运行时代码的语法，例如普通 enum；“类型注解擦除”不等于“所有 TS 特有语法都不产生值”。断言 as T 更不会转换或验证数据。',
          sources: [['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/2/basics.html']],
        },
        chain: 'ts',
      },
      {
        type: 'truefalse',
        q: '所有 TypeScript enum（包括 const enum）都会在编译后保留运行时对象。',
        answer: false,
        explain:
          '普通非 ambient enum 通常生成运行时对象；数值 enum 还会生成由值查名称的反向映射，字符串 enum 通常只有名称到值。const enum 在典型配置下把成员访问内联，可能不保留对象；preserveConstEnums 等配置会影响产物，因此原题不能无条件判断为真。',
        detail: {
          code: 'enum Status { Ready, Done }\nconsole.log(Status.Ready, Status[0]); // 0 Ready\nenum Kind { File = "file" }\nconsole.log(Kind.File); // file\nconst enum Flag { On = 1 }\nconst value = Flag.On; // 常见配置下内联为 1',
          pitfalls:
            '发布库里的 ambient const enum 有版本错配与工具链风险。简单枚举值也可用 as const 对象加联合类型表达，选择时核对编译输出。',
          sources: [['TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/enums.html']],
        },
      },
    ],
  },
  {
    id: 13,
    name: '浏览器渲染与安全',
    desc: '渲染原理+Web安全+存储',
    difficulty: 'hard',
    icon: '🌍',
    questions: [
      {
        type: 'choice',
        q: '浏览器渲染的完整流程？DOM/CSSOM/渲染树的关系？',
        options: [
          '浏览器直接渲染 HTML 不需要构建树',
          '解析 HTML/CSS 后结合 DOM、样式与布局信息完成布局、绘制和合成；display:none 不生成相应布局盒，visibility:hidden 通常仍保留布局空间',
          'CSSOM 和 DOM 是同一棵树',
          '布局在渲染树之前',
        ],
        answer: 1,
        explain:
          '浏览器解析 HTML 建立 DOM，解析 CSS 建立样式规则及 CSSOM，样式计算决定节点采用哪些值；布局确定盒子的尺寸与位置，绘制生成绘制指令并进行栅格化，合成把各层组合成最终画面。常说的“渲染树”是理解这些参与布局/绘制对象的教学模型，不等于所有 DOM 节点的逐一副本。',
        detail: {
          principle:
            'display:none 的子树通常不产生布局盒；visibility:hidden 的盒仍占布局空间，但通常不绘制内容。HTML 解析可流式进行，样式和脚本加载会影响后续阶段，不必等所有图片完成才生成第一帧。',
          example:
            '新增一个节点会改变 DOM，若样式使它 display:none，则不占布局；改为可见后可能触发样式、布局和绘制。纯颜色变化通常无需重新计算几何尺寸。',
          pitfalls:
            'CSSOM、DOM 与最终盒结构各自作用不同。伪元素能参与渲染，文本节点也会生成文本布局，不能简化为“渲染树只包括可见元素标签”。',
          followups: [],
          sources: [
            [
              'MDN · 浏览器如何工作',
              'https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '什么是回流(重排)和重绘？怎样减少？合成层是什么？',
        options: [
          '回流和重绘是同一件事',
          '回流重新计算布局，重绘更新绘制内容；合成层可复用栅格结果。批量读写、减少工作与合适动画有助优化，但 transform/opacity 并非无条件免除绘制成本',
          '使用 will-change 后就可以无限创建图层而不增加成本',
          '每次改变文字颜色都必须重新计算整个页面布局',
        ],
        answer: 1,
        explain:
          '回流/布局是重新计算元素几何关系；重绘是重新生成外观相关的绘制内容。合成把独立层的结果按变换、透明度等组合成画面。优化时先减少受影响范围与读写交错，再选择适合的 transform/opacity 动画，并通过 Performance 验证实际经过哪些阶段。',
        detail: {
          principle:
            '浏览器可把多次修改合并。先写宽度再同步读 offsetWidth，若布局已失效，就可能强制立即完成布局；循环中反复这样做形成 layout thrashing。把读取集中在写入前，或批量更新，可减少反复工作。',
          example:
            '拖动元素时用 transform 改视觉位置通常能避免每帧改变文档布局，但元素是否有合成层、是否还要绘制取决于内容和实现。可用渲染/图层工具确认，而不是只看到属性名就认定零成本。',
          pitfalls:
            'opacity:0、visibility:hidden、display:none 的布局、命中与可访问性语义不同，不能为了性能随意互换。滥用 will-change 会增加图层内存。',
          followups: [],
          sources: [
            [
              'MDN · 浏览器如何工作',
              'https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '浏览器的垃圾回收机制？V8 的新生代和老生代回收策略？',
        options: [
          '浏览器不回收内存',
          '回收主要依据对象是否可达；V8 分代管理，短寿命对象与长期存活对象采用相应策略，并结合增量、并行或并发工作降低停顿，细节依版本而变',
          '被全局变量一直引用的对象只要足够老就一定会被回收',
          'V8 所有版本的新生代大小和晋升阈值都完全固定',
        ],
        answer: 1,
        explain:
          '垃圾回收从根和可达关系识别仍在使用的对象，不可达对象才有资格回收。V8 使用分代思路：年轻对象频繁检查，长期存活对象进入老一代；经典年轻代算法以复制存活对象为主，老一代使用标记、清扫及按需整理，并结合增量、并行和并发工作降低停顿。具体收集器与阈值随版本和配置变化。',
        detail: {
          principle:
            '复制只搬运存活对象，适合多数对象短命的场景；标记清扫回收未标记区域，整理移动存活对象以减少碎片。跨代引用需要写屏障等记录机制，不能只检查年轻代内部引用。',
          example:
            '组件关闭后，注册在全局对象上的监听仍引用组件状态，这些对象依然可达，GC 不会帮你“判断业务已经不用了”。解除监听并清理持有者后，才可能被回收。',
          pitfalls:
            '不要背固定“新生代 1–8MB”或固定晋升次数。闭包和循环引用本身不是泄漏判据，关键是是否仍被根可达。',
          followups: [],
          sources: [['V8 · Orinoco 垃圾回收', 'https://v8.dev/blog/trash-talk']],
        },
        chain: 'memory',
      },
      {
        type: 'choice',
        q: '浏览器的存储方案有哪些？Cookie/LocalStorage/SessionStorage/IndexedDB 的区别？',
        options: [
          '所有存储都一样',
          'Cookie 按作用域与策略随请求发送；Web Storage 是同步字符串存储，localStorage 与 sessionStorage 生命周期不同；IndexedDB 提供异步结构化存储、索引与事务',
          'LocalStorage 会自动发送给服务器',
          'IndexedDB 同步操作',
        ],
        answer: 1,
        explain:
          'Cookie 由浏览器按域、路径和安全属性随符合条件的 HTTP 请求发送，适合承载会话标识；localStorage 是同源同步字符串键值存储，跨重启可保留；sessionStorage 还按顶层浏览上下文分隔，通常随该标签页会话结束；IndexedDB 是异步的结构化数据存储，支持索引与事务，适合较多离线数据。',
        detail: {
          principle:
            'Web Storage 同步访问可能阻塞主线程；IndexedDB 可处理对象与 Blob，但事务有生命周期。浏览器配额、驱逐和隐私策略不同，不能承诺固定容量或永不丢数据。Cookie 也不会无条件附带到所有请求。',
          example:
            '登录标识可使用 Secure、HttpOnly、合适 SameSite 的 Cookie；主题偏好用 localStorage；单标签临时步骤用 sessionStorage；可恢复草稿用 IndexedDB，并设计失败、容量不足和同步策略。',
          pitfalls:
            '客户端存储都不能当作服务端授权依据。HttpOnly Cookie 不能被 JS 读，但仍可能被浏览器用于请求。',
          followups: [],
          sources: [
            [
              'MDN · 存储配额与驱逐',
              'https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria',
            ],
          ],
        },
        chain: 'platform-idb',
      },
      {
        type: 'choice',
        q: 'CSP(内容安全策略)是什么？怎么配置？防什么攻击？',
        options: [
          'CSP 是加密传输协议',
          '通过 CSP 响应头约束脚本、资源与嵌入等行为，用 nonce 等策略减少脚本注入风险；Report-Only 用于观察候选策略，不能替代输出安全和 HTTPS',
          'CSP 可以替代 HTTPS',
          'CSP 只能防止 CSRF',
        ],
        answer: 1,
        explain:
          'CSP 是浏览器依据页面响应策略限制资源来源和部分代码执行方式的机制，可降低 XSS 注入代码成功执行的机会，也可用 frame-ancestors 控制页面被谁嵌入。通常通过 Content-Security-Policy 响应头配置；先用 Report-Only 收集影响，再逐步强制执行。',
        detail: {
          principle:
            '例如给每次响应生成不可预测 nonce，在 script-src 声明相同 nonce，并只给受信任脚本添加它；配置 object-src 与 base-uri 收紧旧插件和基础 URL。策略是否允许脚本执行由具体指令决定，宽泛允许 unsafe-inline 会削弱保护。',
          example:
            "示意策略 default-src 'self'; script-src 'nonce-本响应随机值'; object-src 'none'; base-uri 'none'，还需按实际图片、连接、样式和框架需求调整，不能直接复制后假设业务都可用。",
          pitfalls:
            'CSP 是纵深防护，不能替代输出编码、富文本净化和服务端授权。Report-Only 记录违反候选策略的行为，不等同于阻断。',
          followups: [],
          sources: [['MDN · CSP', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP']],
        },
        chain: 'sec-csp',
      },
      {
        type: 'choice',
        q: '什么是同源策略？为什么需要它？跨域方案有哪些？',
        options: [
          '同源策略是浏览器的 bug',
          '同源策略隔离不同源页面对敏感响应、DOM 和存储的访问；按场景使用 CORS、受控同源代理或校验来源的 postMessage，Cookie 的作用域另有规则',
          'Cookie 的作用域与 origin 完全相同，并且始终按端口隔离',
          '跨域方案只有 JSONP',
        ],
        answer: 1,
        explain:
          '同源通常要求协议、主机和端口一致。同源策略隔离不同网站的脚本读权限和文档访问，防止一个网站直接读取用户在另一个网站的敏感内容。跨源资源加载与表单发送仍有允许路径，所以它不是“任何跨源数据都不发送”。',
        detail: {
          principle:
            '跨源 API 可以用 CORS 明确授予特定源读取权限；也可通过同源 BFF 代理后端请求。跨窗口通信使用 postMessage 并验证 origin/source 与消息结构。Cookie 的域、路径、SameSite 规则与 origin 规则相关但不等同。',
          example:
            'evil.example 可以诱导浏览器向其他站点发送某些请求，却不能因此直接读取受保护响应。这解释了为什么同源策略存在时仍要防 CSRF。',
          pitfalls:
            '开发代理只改变浏览器看到的请求目标。JSONP 会执行对方脚本，适用范围与信任条件不同于读取 JSON。',
          followups: [],
          sources: [['MDN · CORS', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS']],
        },
        chain: 'origin',
      },
      {
        type: 'choice',
        q: '什么是 Service Worker？它能做什么？和 Web Worker 的区别？',
        options: [
          'Service Worker 就是 Web Worker 改名',
          'Service Worker 是受作用域与生命周期约束的事件驱动代理，可处理受控请求和离线缓存；Dedicated Worker 常用于页面关联后台计算，两者都不能直接操作 DOM',
          'Service Worker 可以操作 DOM',
          'Service Worker 是永不停止的常驻进程，所有全局变量都能永久保留',
        ],
        answer: 1,
        explain:
          'Service Worker 是由浏览器管理、按注册作用域处理事件的脚本环境，可以拦截受控页面的网络请求，结合 Cache API 实现离线策略，也可参与推送等能力。它不能直接操作 DOM，通常要求安全上下文。普通 Dedicated Worker 主要为页面卸载计算任务，不具有相同的请求拦截与注册更新生命周期。',
        detail: {
          principle:
            '首次注册后经历安装、等待与激活；是否已控制当前页面需具体检查。浏览器可能停止空闲 Service Worker，事件到来再启动，所以不能依赖其全局变量永久保存状态。持久数据应放在合适存储中。',
          example:
            '离线页面可对静态壳使用缓存优先、对业务数据使用网络优先并提供过期提示；策略按资源类别选择。新 Worker 安装完成不表示旧标签页立即切换版本。',
          pitfalls:
            'Service Worker 不是永远运行的后台守护进程；Push/后台同步等能力的支持与限制应按目标浏览器验证。',
          followups: [],
          sources: [
            ['MDN · Service Worker', 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API'],
          ],
        },
        chain: 'platform-sw',
      },
      {
        type: 'choice',
        q: 'XSS 攻击有哪些类型？如何全面防御？',
        options: [
          'XSS 就是注入 SQL',
          '按数据持久化与传播路径区分存储型、反射型，并识别 DOM 注入；按输出上下文编码、对富文本清理、限制危险 sink，再结合 CSP 和凭据保护',
          'XSS 只有一种类型',
          'HTTPS 可以防 XSS',
        ],
        answer: 1,
        explain:
          '常见 XSS 分类包括：存储型——恶意内容持久保存后被其他用户浏览；反射型——请求数据被拼进当次响应；DOM 型——客户端把不可信数据送入危险解释位置。防御要覆盖数据进入哪种上下文，以及最终通过什么 API 展示，不能只检查输入字符串有没有 script。',
        detail: {
          principle:
            '纯文本用文本节点；HTML、属性、URL、JS 等上下文采用各自编码和校验；富文本用维护中的净化库，限制标签、属性和协议，并保证净化后不再任意拼接 HTML。配合 CSP、HttpOnly 与依赖治理缩小影响。',
          example:
            'Vue 的插值与 React 的普通文本节点默认会转义，但 v-html、dangerouslySetInnerHTML 或编辑器插件可能绕开默认保护。应对保存、历史版本、预览和分享入口统一验证。',
          pitfalls:
            'HttpOnly 仅限制 Cookie 读取，不会阻止恶意脚本在当前身份下操作页面；客户端校验也不能替代服务端和最终展示边界。',
          followups: [],
          sources: [
            [
              'OWASP · XSS 防护',
              'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html',
            ],
          ],
        },
        chain: 'sec-richtext',
      },
      {
        type: 'truefalse',
        q: 'HTML 解析器遇到未设置 async/defer 的经典 script 时，通常会暂停解析并执行该脚本。',
        answer: true,
        explain:
          '对 HTML 解析器遇到、没有 async/defer 的经典脚本，这个说法成立：解析会等待外部脚本可执行并执行它，然后继续。async 的下载可并行，但执行时可能打断解析且不保证文档顺序；defer 经典外部脚本在解析后按顺序执行。模块脚本默认具有延后执行的行为。',
        detail: {
          principle:
            '脚本下载、执行和 HTML 解析是三个不同阶段。即使 async 不阻塞下载阶段的解析，它执行长同步代码时仍会占用主线程。',
          example:
            '两个有依赖关系的经典脚本适合通过正确顺序的 defer 加载；独立统计脚本可考虑 async，但要评估主线程和隐私约束。',
          pitfalls:
            '动态插入脚本、模块的依赖加载以及内联脚本有各自规则；题干应限定常见解析器插入的经典脚本。',
          followups: [],
          sources: [
            [
              'MDN · 浏览器如何工作',
              'https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: '浏览器的重排(回流)一定比重绘代价大。',
        answer: false,
        explain:
          '错误。“一定”不成立。一次布局的成本取决于受影响树的规模与约束；绘制的成本取决于可见面积、效果复杂度、图层与设备。很小子树的布局可能便宜，而大面积复杂阴影或滤镜绘制可能昂贵。应在相同场景中测量，不把阶段名称当成固定耗时排序。',
        detail: {
          principle:
            '布局影响几何，绘制影响像素内容，两者经常相关但不能用“回流必然整页重绘”推断代价。浏览器可跳过未受影响的工作，也可能复用图层。',
          example:
            '改变一个独立小容器的尺寸，与重绘覆盖整屏的复杂效果相比，前者未必更慢。用一次 Performance 录制查看 Layout、Paint、Raster 等实际耗时。',
          pitfalls: '优化目标是减少用户等待和帧超时，不是机械地让所有操作都成为 transform。',
          followups: [],
          sources: [
            [
              'MDN · 浏览器如何工作',
              'https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work',
            ],
          ],
        },
      },
    ],
  },
  {
    id: 14,
    name: 'Redis 与后端深谷',
    desc: '缓存策略与后端高频考点',
    difficulty: 'hard',
    icon: '🗄️',
    questions: [
      {
        type: 'choice',
        q: '缓存穿透是什么？怎么解决？',
        options: [
          '缓存穿透就是缓存太多数据',
          '缓存未命中且数据库也不存在，反复查询使请求持续回源；可以校验参数、短期缓存不存在结果、维护布隆过滤器及限流，需处理新增数据失效',
          '缓存穿透是缓存过期了',
          '缓存穿透不影响数据库',
        ],
        answer: 1,
        explain:
          '缓存穿透是请求反复查询不存在的数据，缓存未命中后仍不断访问数据库。先做合法参数和访问预算控制，再按业务采用短期负缓存或存在性过滤器。并非只有恶意请求才会触发，合法用户查询已删除或尚不存在的资源也可能造成穿透。',
        detail: {
          principle:
            '负缓存把“不存在”作为有时限的结果保存；新建资源后需使对应负缓存失效。布隆过滤器可快速排除确定不存在的项，但有误报，要考虑新资源同步、重建和容量；不能只加过滤器就忘记真实查询。',
          example:
            '大量查询随机不存在文件 ID 时，记录数据库未命中率和每个用户的查询速率；缓存空结果可减少重复 ID 的负载，但对每次都不同的 ID 仍需要限流或存在性过滤。',
          pitfalls: '缓存键必须包含租户和影响结果的条件，不能把某用户“无权限”缓存成所有用户的“不存在”。',
          followups: [],
          sources: [
            [
              'Microsoft · Cache-Aside',
              'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '缓存击穿是什么？和穿透的区别？怎么解决？',
        options: [
          '缓存击穿就是缓存坏了',
          '热点缓存失效导致并发重建；区别于反复查询不存在数据的穿透。可合并重建、提前刷新或有条件返回旧值，并限制等待时间与回源并发',
          '缓存击穿和穿透是同一个问题',
          '缓存击穿不需要处理',
        ],
        answer: 1,
        explain:
          '缓存击穿是一个热点缓存失效时，大量并发请求同时回源；穿透则关注查询的数据原本不存在。可以按 key 合并并发回源、提前刷新，或在业务允许时短期返回旧值并后台更新；同时给数据库调用和等待队列设上限。',
        detail: {
          principle:
            '常见互斥重建流程是：读缓存未命中→争取重建资格→取得资格后再次读缓存→查询权威数据→写缓存→释放。未获资格的请求应有限等待、返回允许的旧值或明确降级，不应无限排队。',
          example:
            '权限规则不适合随意返回旧授权。热门公开帮助文档通常可容忍短期旧内容；两类数据的降级契约应分开。',
          pitfalls:
            '锁过期后旧重建任务仍可能继续，需要版本条件等保护最终写入。“永不过期”会带来陈旧数据和内存管理问题。',
          followups: [],
          sources: [
            [
              'Microsoft · Cache-Aside',
              'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
            ],
          ],
        },
        chain: 'system-cache-hot',
      },
      {
        type: 'choice',
        q: '缓存雪崩是什么？怎么预防和恢复？',
        options: [
          '缓存雪崩就是 Redis 崩溃了',
          '大量缓存集中失效或缓存服务故障造成回源冲击；通过错峰失效、可用性与降级设计预防，故障时先保护数据库，再限速恢复和预热',
          '缓存雪崩是单个 key 过期',
          '缓存雪崩不需要预防',
        ],
        answer: 1,
        explain:
          '缓存雪崩是大量缓存同时失效或缓存服务不可用，使回源流量超出数据库容量。预防包括错开过期时间、热点提前刷新、缓存高可用、回源并发上限和可接受的降级。恢复时先保护数据库，再分批预热或放量，避免缓存刚恢复又被一次性请求压垮。',
        detail: {
          principle:
            'TTL 加随机抖动缓解“同时到期”，却不能解决整个 Redis 故障；副本与故障转移提高可用性，也不能替代应用限流、超时和熔断。不同故障要对应不同措施。',
          example:
            '演练暂时不可用时，应检查数据库 QPS 上限、拒绝率和核心业务成功率；恢复后观察回源峰值与预热进度，而非仅看 Redis 进程重新启动。',
          pitfalls: '本地多级缓存需明确实例间一致性和撤权窗口。不能用长期缓存敏感权限换取表面可用性。',
          followups: [],
          sources: [
            [
              'Microsoft · Cache-Aside',
              'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: 'Redis 分布式锁怎么实现？有什么坑？Redlock 算法了解吗？',
        options: [
          '只需 SET 一个无过期键，结束后随意 DEL',
          '用唯一 token 的有期限原子加锁和校验释放，并在持久化提交处防止旧执行者写入；Redlock 需说明故障假设',
          '只要定时续期就能保证所有业务恰好执行一次',
          'Redlock 就是对同一个主从复制组写一次锁',
        ],
        answer: 1,
        explain:
          '单实例租约锁常用 SET key token NX PX ttl 原子获取，token 唯一标识持有者；释放必须原子比较 token 后删除，防止误删后来者的锁。租约过期、进程暂停或故障转移都可能让旧持有者继续工作，所以锁本身不能保证外部业务只提交一次。',
        detail: {
          principle:
            '续期只在仍持有相同 token 时进行，并设总体预算；续期也无法消除长暂停和网络分区。Redlock 尝试在多个独立实例的多数上于有限时间内获得租约，依赖相应时钟、时限与故障模型；不能把它简化成“主从切换问题的万能修复”。',
          example:
            '文件合并 A 持锁后暂停，租约过期 B 合并成功，A 恢复仍可能写旧结果。最终发布应有资源版本、fencing token 或数据库条件提交，让旧执行者不能覆盖已确认的新状态。',
          pitfalls:
            '支付、库存等正确性还需由持久化状态和幂等契约保障。即使用协调服务，也必须设计获得锁之后的提交边界。',
          followups: [
            [
              '为什么 GET token 后再 DEL 不够？',
              'GET 与 DEL 间可能发生过期和新持有者获取。将比较与删除放到同一原子操作或受支持脚本中，才不会在窗口内误删。',
            ],
          ],
          sources: [
            [
              'Redis · Distributed locks',
              'https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/',
            ],
          ],
          code: 'if redis.call("get", KEYS[1]) == ARGV[1] then\n  return redis.call("del", KEYS[1])\nend\nreturn 0',
        },
        chain: 'merge',
      },
      {
        type: 'choice',
        q: 'Redis 的数据结构有哪些？各自的应用场景？',
        options: [
          'Redis 只有 String 一种类型',
          'String 适合简单值和计数，Hash 适合字段访问，Set 适合去重，ZSet 适合按分值排序，List/Stream 可组织队列；可靠性与内存收益需按实现验证',
          'Redis 不能做排行榜',
          'Redis 的 Hash 不能存储对象',
        ],
        answer: 1,
        explain:
          '常用类型可按访问模式讲：String 存标量、序列化缓存或计数；Hash 存按字段访问的记录；List 存有顺序的元素；Set 做成员去重和集合运算；Sorted Set 按分值排序，适合排行榜。Bitmap 表达位状态，HyperLogLog 估计基数，Geo 做地理索引，Stream 管理带 ID 的事件流。',
        detail: {
          principle:
            '类型选择还要考虑操作复杂度和数据上限。Hash 可以避免每次改一个字段都重写整个 JSON，但是否更省内存取决于对象大小与编码。List 的简单弹出不自动提供确认重投；Stream 消费组有待处理记录，也仍需业务去重。',
          example:
            '用 ZSET 的 score 表示任务到期时间能做调度候选集，但领取、执行失败、重试和多个消费者竞争需要另外设计，不能把“有序集合”当成完整可靠队列。',
          pitfalls: 'HyperLogLog 给近似去重计数，不能列出成员；排行榜同分规则和分页稳定性要明确。',
          followups: [],
          sources: [['Redis · Data types', 'https://redis.io/docs/latest/develop/data-types/']],
        },
      },
      {
        type: 'truefalse',
        q: 'Redis 是单线程的所以性能很差。',
        answer: false,
        explain:
          '错误。经典 Redis 的主要命令执行通常串行处理，但网络 I/O、持久化等可以使用其他线程或进程；具体行为取决于版本与配置。内存访问、紧凑数据结构及减少同步开销有利于高吞吐，但慢命令、大 key、CPU、网络、内存或持久化都可能成为瓶颈。',
        detail: {
          principle:
            '单条命令的执行原子性不等于多条业务命令组合自动原子。一次长时间遍历或大对象操作可能阻塞其他请求，所以要同时看命令耗时与数据规模。',
          example:
            '同样的 QPS，GET 小值与复杂集合操作、大响应体的资源消耗完全不同。先查 SLOWLOG、延迟、CPU、网络吞吐和内存压力，再决定优化。',
          pitfalls: '不能承诺固定“十万 QPS”，也不能断言瓶颈一定不在 CPU。',
          followups: [],
          sources: [['Redis · Data types', 'https://redis.io/docs/latest/develop/data-types/']],
        },
      },
      {
        type: 'truefalse',
        q: 'RDB 以时间点快照保存数据，AOF 记录写操作并可通过重写整理日志。',
        answer: true,
        explain:
          '这个概括基本正确：RDB 保存某一时点的数据快照；AOF 记录修改数据的操作以便重放，重写会压缩等价历史。RDB 的丢失窗口取决于快照间隔，AOF 的持久性取决于 fsync 策略和故障条件；开启持久化不等于每次返回成功的数据都已落到稳定存储。',
        detail: {
          principle:
            'BGSAVE 通常 fork 后生成快照；SAVE 会在主流程同步保存，不能把二者都说成后台 fork。现代 Redis 的 AOF 可分为基础文件和增量文件，基础部分也可使用 RDB 格式，具体布局按版本查看。',
          example:
            '每秒 fsync 的 AOF 在故障时可能丢失最近的一段写入；更强持久策略通常带来更多 I/O 成本。恢复演练需验证备份可用、加载时间和业务记录一致性。',
          pitfalls: '复制、高可用、持久化和备份解决不同问题；误删若已复制并持久化，仍需要可用的历史备份。',
          followups: [],
          sources: [
            [
              'Redis · Persistence',
              'https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/',
            ],
          ],
        },
      },
    ],
  },
  {
    id: 15,
    name: '算法与数据结构之巅',
    desc: '高频算法题与数据结构',
    difficulty: 'boss',
    icon: '🧮',
    questions: [
      {
        type: 'choice',
        q: '说说常见排序算法的时间复杂度和稳定性？',
        options: [
          '所有排序的时间复杂度都相同',
          '快排平均 O(n log n) 但最坏 O(n²)；归并可稳定，计数/基数的复杂度还依赖键范围或位数',
          '只要平均 O(n log n) 就一定稳定',
          '桶排序在任意数据分布下都保证 O(n)',
        ],
        answer: 1,
        explain:
          '常见比较排序中：冒泡与插入平均/最坏 O(n²)，常规实现稳定；选择排序 O(n²)，常规交换版不稳定；快排平均 O(n log n)、最坏 O(n²)，通常不稳定；归并 O(n log n)，正确处理相等元素时稳定；堆排 O(n log n)，通常不稳定。稳定指相等键元素保留原相对顺序。',
        detail: {
          example:
            '带原始序号的 [(2,A),(1,B),(2,C)] 按数字排序，稳定结果应为 [(1,B),(2,A),(2,C)]。归并时相等元素先取左侧；如果先取右侧就会破坏这项性质。',
          pitfalls:
            '计数排序 O(n+k) 依赖键范围 k，稳定版本需额外输出空间；基数排序常为 O(d(n+k))，d 为位数；桶排序线性期望依赖分布，不能把三者统一保证 O(n+k)。JS 规范要求现代 sort 稳定，不要求引擎必须用某个具体算法。',
          sources: [
            [
              'MIT OCW · Algorithms',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
            [
              'MDN',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '二分查找的条件和实现要点？常见变体？',
        options: [
          '任意无序数据都可按下标折半查值',
          '依赖单调判定排除半区；先统一区间不变量，再处理左边界、右边界、重复值与未命中结果',
          '二分时区间无需每轮缩小',
          'JavaScript 中点一律用位运算即可避免问题',
        ],
        answer: 1,
        explain:
          '二分的本质是利用单调判定每次排除一半候选；在有序数组中随机访问可实现 O(log n) 查询。先统一区间语义，再写移动规则。下面用左闭右开区间 [left,right) 找第一个大于等于 target 的位置；找不到则返回数组长度。',
        detail: {
          code: 'function lowerBound(a, target) {\n  let left = 0, right = a.length;\n  while (left < right) {\n    const mid = left + Math.floor((right - left) / 2);\n    if (a[mid] < target) left = mid + 1;\n    else right = mid;\n  }\n  return left;\n}',
          example:
            '[1,2,2,4] 查 2 返回 1；查 5 返回 4；空数组返回 0。若要最后一个 <=target，先求第一个 >target，再减一。旋转数组要判断哪半有序；答案空间二分需要说明可行性谓词为什么单调。',
          pitfalls:
            'JS 用位运算求中点会转成 32 位整数，长数组可能出错。不能混用闭区间的 right=mid-1 与此半开模板；重复值、空数组、全部小于和全部大于必须测试。',
          sources: [
            [
              'MIT OCW · Algorithms',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
          ],
        },
        chain: 'binary',
      },
      {
        type: 'choice',
        q: '链表的高频操作？反转链表/检测环/合并有序链表怎么做？',
        options: [
          '链表和数组操作完全一样',
          '反转：三指针(prev/curr/next)迭代或递归；检测环：快慢指针(快 2 步慢 1 步相遇有环)或 Set；合并：哑节点+双指针比较；找中点：快慢指针(快到尾慢在中点)',
          '反转链表只能用递归',
          '检测环不能用快慢指针',
        ],
        answer: 1,
        explain:
          '反转单链表用 prev/curr/next 保存断链前的下一节点，再逐步反向连接；检测环用快慢指针，快指针一次两步，存在环时最终相遇；合并有序链表用哑头和尾指针逐项接入较小节点。三者都需先约定节点结构与是否允许修改原链。',
        detail: {
          code: 'function reverse(head) {\n  let prev = null, curr = head;\n  while (curr) { const next = curr.next; curr.next = prev; prev = curr; curr = next; }\n  return prev;\n}\nfunction hasCycle(head) {\n  let slow = head, fast = head;\n  while (fast && fast.next) {\n    slow = slow.next; fast = fast.next.next;\n    if (slow === fast) return true;\n  }\n  return false;\n}\nfunction mergeLists(a, b) {\n  const dummy = {next: null}; let tail = dummy;\n  while (a && b) {\n    if (a.val <= b.val) { tail.next = a; a = a.next; }\n    else { tail.next = b; b = b.next; }\n    tail = tail.next;\n  }\n  tail.next = a || b; return dummy.next;\n}',
          pitfalls:
            '反转/检测时间 O(n)、额外 O(1)；合并 O(n+m)、额外 O(1)，示例复用原节点。反转和合并输入假定无环，合并还假定两链不共享节点。找环入口：相遇后一个指针回头，两者每次一步再次相遇。',
          sources: [
            [
              'MIT OCW · Algorithms',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '二叉树的遍历方式？前/中/后/层序怎么实现？',
        options: [
          '二叉树只能递归遍历',
          '前序(根左右) 中序(左根右 BST 升序) 后序(左右根) 层序(BFS 队列)；递归简单 非递归用栈(前/中/后)或队列(层序)；常见题：最大深度/翻转/对称路径/最近公共祖先',
          '层序遍历用栈',
          '中序遍历 BST 得到降序序列',
        ],
        answer: 1,
        explain:
          '前序是根左右，中序是左根右，后序是左右根；递归访问位置决定顺序，迭代 DFS 用栈保存待处理节点。层序 BFS 用队列，每轮固定本层末端，把孩子放到后面。所有遍历访问每个节点一次，时间 O(n)；DFS 的递归栈为 O(h)，层序活动队列与树宽有关。',
        detail: {
          code: 'function traversals(root) {\n  const pre = [], mid = [], post = [];\n  function visit(n) {\n    if (!n) return;\n    pre.push(n.val); visit(n.left);\n    mid.push(n.val); visit(n.right); post.push(n.val);\n  }\n  visit(root); return {pre, mid, post};\n}\nfunction levels(root) {\n  if (!root) return [];\n  const q = [root], out = []; let head = 0;\n  while (head < q.length) {\n    const end = q.length, row = [];\n    while (head < end) {\n      const n = q[head++]; row.push(n.val);\n      if (n.left) q.push(n.left); if (n.right) q.push(n.right);\n    }\n    out.push(row);\n  }\n  return out;\n}',
          pitfalls:
            '此下标队列保留已访问元素，实际数组占 O(n)，不能冒称只有 O(树宽)。很深的树可能使递归调用栈溢出；若输入可能有环，要改按图遍历并记录 visited。BST 的中序有序依赖有效的树约束。',
          sources: [
            [
              'MIT OCW · Algorithms',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
          ],
        },
        chain: 'bfs',
      },
      {
        type: 'choice',
        q: '什么是动态规划？核心要素？和贪心的区别？',
        options: [
          '动态规划就是递归',
          '定义状态与转移并复用子问题结果，明确初值和计算顺序；贪心每步取局部最优，须另证其选择安全',
          '贪心一定得到全局最优',
          'DP 不需要状态定义',
        ],
        answer: 1,
        explain:
          '动态规划定义能概括子问题的状态，用已求得的小状态组合更大的状态，并缓存结果。优化问题常需最优子结构，重复子问题带来缓存收益。做题要给出状态含义、转移、初值、不可达状态和遍历顺序。贪心每步选局部最优，只有证明该选择安全时才能得到全局最优。',
        detail: {
          code: 'function minCoins(coins, amount) {\n  const dp = Array(amount + 1).fill(Infinity); dp[0] = 0;\n  for (let x = 1; x <= amount; x++) {\n    for (const c of coins) if (c <= x) dp[x] = Math.min(dp[x], dp[x-c] + 1);\n  }\n  return Number.isFinite(dp[amount]) ? dp[amount] : -1;\n}',
          example:
            '面额 [1,3,4] 凑 6，贪心选 4+1+1 共3枚，DP 可得 3+3 共2枚。状态 dp[x] 表示恰好凑 x 的最少枚数，枚举最后一枚 c；按金额递增保证读取的 x-c 已求解。',
          pitfalls:
            '示例假定面额为正整数、金额为非负整数。复杂度 O(金额×面额数)，不是输入位数的多项式界；金额很大时可能不可行。错误状态或转移不会因为叫 DP 就保证最优。',
          sources: [
            [
              'MIT OCW · Dynamic Programming',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
          ],
        },
        chain: 'dp',
      },
      {
        type: 'choice',
        q: '栈和队列的应用场景？用栈实现队列/用队列实现栈怎么做？',
        options: [
          '栈和队列功能完全一样',
          '栈后进先出、队列先进先出；双栈倒入可实现队列，队列旋转可让新元素位于队首从而模拟栈',
          '栈可以随机访问',
          '队列是 LIFO',
        ],
        answer: 1,
        explain:
          '栈后进先出，适合括号匹配、调用帧和 DFS；队列先进先出，适合 BFS、就绪任务与按到达顺序处理。两个栈实现队列时，只在输出栈为空时把输入栈全部倒入，每个元素最多移动一次；一个队列实现栈可在入队后旋转旧元素，让新元素来到队首。',
        detail: {
          code: 'class QueueByStacks {\n  constructor() { this.input = []; this.output = []; }\n  push(x) { this.input.push(x); }\n  pop() {\n    if (!this.output.length) while (this.input.length) this.output.push(this.input.pop());\n    return this.output.pop(); // 空时 undefined\n  }\n}\nclass StackByQueue {\n  constructor() { this.q = []; }\n  push(x) {\n    const n = this.q.length; this.q.push(x);\n    for (let i = 0; i < n; i++) this.q.push(this.q.shift());\n  }\n  pop() { return this.q.shift(); }\n}',
          pitfalls:
            '双栈队列操作均摊 O(1)，一次倒栈仍可能 O(n)。队列模拟栈的抽象操作数为入栈 O(n)、出栈 O(1)；示例用 JS 数组 shift，具体实现可能搬移元素，不能据此承诺这些实际时间界，工程版可用环形队列。',
          sources: [
            [
              'MIT OCW · Algorithms',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: '快速排序的最坏时间复杂度是 O(n²)。',
        answer: true,
        explain:
          '正确。若快排每次分区只排除一个元素，递推为 T(n)=T(n-1)+O(n)，求和得到 O(n²)。例如已排序输入配合始终选端点为 pivot 的某些分区实现。随机 pivot 可降低这种序列出现概率，但不把最坏情况自动变成 O(n log n)。',
        detail: {
          pitfalls:
            '大量重复键可能使某些双路分区退化，可考虑三路分区；控制递归深度或使用带回退策略的排序能限制风险。不能声称快排在所有实际输入里最快。',
          sources: [
            [
              'MIT OCW · Algorithms',
              'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: '哈希表的平均查找时间复杂度是 O(1)。',
        answer: true,
        explain:
          '在良好的散列分布和受控装载因子下，哈希表查找具有期望或平均 O(1) 时间；冲突严重时可能退化。链地址法把冲突项存入桶结构，开放寻址在表内按探测规则寻找槽；扩容需要重新安排元素，所以单次插入也可能昂贵。',
        detail: {
          example:
            '用链地址法且所有键落入一个长度 n 的桶时，查找可能扫描 O(n)。把桶改成树可改善特定实现的退化情况，但属于实现选择。',
          pitfalls:
            'ECMAScript Map 只要求平均访问时间对集合大小为次线性，未要求必须使用哈希表或严格 O(1)。回答通用哈希表与某个语言容器时应分开。',
          sources: [
            ['MDN', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map'],
          ],
        },
      },
      {
        type: 'choice',
        chain: 'window',
        q: '求字符串 abba 的最长无重复子串长度，扫描时写成 left = last.get(ch) + 1 会算出什么错误结果？',
        options: [
          '结果偏小，因为漏掉了窗口扩展',
          '左边界会被拉回去，把 bba 错算成合法窗口',
          '左边界永远不会移动',
          '结果正确，只是慢一些',
        ],
        answer: 1,
        explain:
          '正确答案是 2。遍历到最后一个 a 时，它上次出现的位置 0 已经在当前窗口左侧之外；若直接赋值 left = 0 + 1 = 1，左边界从 2 被拉回到 1，把 bba 当成无重复窗口。左边界必须单调向右，所以要用 Math.max(left, last.get(ch) + 1)。',
        detail: {
          code: 'function longestUnique(text) {\n  const last = new Map();\n  let left = 0, right = 0, best = 0;\n  for (const ch of text) {            // 按码点迭代\n    if (last.has(ch)) left = Math.max(left, last.get(ch) + 1);\n    last.set(ch, right);\n    best = Math.max(best, right - left + 1);\n    right++;\n  }\n  return best;\n}',
          example:
            '以 abba 为例：扫到第二个 a 之前窗口是 "b"（left=2, right=2）。这个 a 上次出现在 0，直接赋值会把 left 拉回 1，窗口变成 "bb a" 里不合法的三段；用 Math.max(2, 0+1)=2，左边界留在原地，正确得到长度 2。',
          pitfalls:
            '左边界回退是这里最典型的错误，根源是只在当前字符重复时无条件移动。另一个容易被忽略的是 JS 字符串的长度口径：for...of 按码点迭代，组合字符仍可能由多个码点组成，产品要说的是“用户看到的字符”就得先按字素簇切分。',
        },
      },
      {
        type: 'choice',
        chain: 'interval',
        q: '合并闭区间 [1,3]、[2,6]、[8,10] 得到什么？为什么必须先排序？',
        options: [
          '[1,6]、[8,10]；排序后每个区间只需和最后一个结果比较',
          '[1,10]；所有区间连成一段',
          '[1,3]、[2,6]、[8,10]；闭区间不相交就不合并',
          '[1,6]、[8,10]；排序只是为了输出好看',
        ],
        answer: 0,
        explain:
          '按起点排序后，[1,3] 与 [2,6] 相交合并成 [1,6]，与 [8,10] 不相交就另起一段。排序的作用是保证不遗漏：只要处理到某一段时，后面所有区间起点都更大，就不会再回头和已经结束的区间相交，因此每段只需和结果数组最后一个比较。',
        detail: {
          code: 'function mergeIntervals(input) {\n  const sorted = [...input].sort((a, b) => a[0] - b[0]);  // 不改原数组\n  const out = [];\n  for (const [start, end] of sorted) {\n    const last = out[out.length - 1];\n    if (last && start <= last[1]) last[1] = Math.max(last[1], end);\n    else out.push([start, end]);\n  }\n  return out;\n}',
          example:
            '输入 [1,10] 和 [2,3] 时，如果用 last[1] = end 直接覆盖终点，10 就被截成 3 了。必须取 Math.max(last[1], end)。另外要事先和调用方确认两件事：端点是否包含、相接的区间（比如 [1,3] 和 [4,6]）要不要合并。',
          pitfalls:
            '不排序就顺序合并，被包含的区间会漏掉。直接赋值 end 而不取最大值，会截断更长的区间。原地 sort 修改了调用方传进来的数组。流式输入若已按起点有序，只需保留当前未关闭的一段，额外空间可以做到 O(1)，不必存下全部区间。',
        },
      },
    ],
  },
  {
    id: 1,
    name: 'CSS 与布局之森',
    desc: 'CSS 布局、动画与工程化',
    difficulty: 'easy',
    icon: '🎨',
    questions: [
      {
        type: 'choice',
        q: '说说 BFC 是什么？解决了什么问题？',
        options: [
          'BFC 让内部元素完全不受外部尺寸影响',
          'BFC 规定块与浮动的布局边界，可用 flow-root 包含浮动并阻止跨边界的外边距折叠',
          '只有 overflow:hidden 能建立 BFC',
          '建立 BFC 后所有相邻外边距都不再折叠',
        ],
        answer: 1,
        explain:
          'BFC 是块级格式化上下文，规定其中块盒、浮动及外边距的布局关系。常用 display: flow-root 为容器建立 BFC：容器会包含内部浮动的高度，内部子块的外边距不会与容器外部折叠；建立 BFC 的盒还会避让外部浮动。它不是“内部完全不受外部影响”的隔离沙箱。',
        detail: {
          example:
            '父容器只有一个 float:left、高 80px 的子元素时，普通流中的父高可能为 0。给父容器 display:flow-root 后父高包含浮动。父子 margin 折叠也可通过新的 BFC 边界阻止；同一 BFC 内相邻块的垂直外边距仍可能折叠。',
          code: '.container { display: flow-root; }\n.float { float: left; width: 80px; height: 80px; }',
          pitfalls:
            'overflow:auto/hidden 也可能建立 BFC，但会引入滚动或裁剪。overflow:clip 本身不建立 BFC。Flex/Grid 容器建立自己的格式化上下文，不能简单称为 BFC。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Display/Block_formatting_context',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: 'Flex 布局中 flex: 1 代表什么？',
        options: [
          'flex: 1 就是宽度为 1px',
          'flex: 1 是 flex-grow:1/flex-shrink:1/flex-basis:0% 的简写表示元素自动伸缩填充剩余空间',
          'flex: 1 表示元素不可缩放',
          'flex: 1 和 flex-grow:1 完全等价',
        ],
        answer: 1,
        explain:
          'flex:1 设置 grow、shrink、basis；浏览器通常将这个单值写法展开为 1 1 0%。有正剩余空间时按 grow 分配；不足时按 shrink 与基础尺寸的乘积收缩。它不保证所有项目最终等宽，也不会自动突破 min-width:auto 形成的内容最小尺寸限制。',
        detail: {
          example:
            '左右两项都 flex:1、容器宽度明确且没有额外最小尺寸约束时，可均分可用空间。某项含很长不可换行文件名时，min-width:auto 可能阻止它收缩；给允许截断的项 min-width:0 才能缩小。',
          code: '.row { display: flex; width: 400px; }\n.item { flex: 1; min-width: 0; }\n.name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }',
          pitfalls:
            '规范的单值展开写作 basis:0，浏览器采用的 0% 在主轴尺寸不确定时可能有不同结果。只写 flex-grow:1 会保留原有 basis，内容大小仍参与分配。',
          sources: [
            ['MDN 官方文档', 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/flex'],
          ],
        },
        chain: 'layout',
      },
      {
        type: 'choice',
        q: '如何实现水平垂直居中？说几种方式。',
        options: [
          '只能用 margin:auto',
          '1)Flex: display:flex justify-content:center align-items:center 2)Grid: display:grid place-items:center 3)绝对定位+transform: top:50% left:50% transform:translate(-50%,-50%)',
          'text-align:center 就能垂直居中',
          'line-height 只能水平居中',
        ],
        answer: 1,
        explain:
          '容器内单个元素居中可用 Flex 的 justify-content:center 与 align-items:center，或 Grid 的 place-items:center。绝对定位方案先让子元素左上角定位到父容器中心，再用 translate(-50%,-50%) 把自身中心移回来。三种方式都要有可供垂直居中的容器高度。',
        detail: {
          code: '/* 方案一 */\n.flex { min-height: 240px; display: flex; justify-content: center; align-items: center; }\n/* 方案二 */\n.grid { min-height: 240px; display: grid; place-items: center; }\n/* 方案三：child 是 parent 的子元素 */\n.parent { position: relative; height: 240px; }\n.child { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }',
          pitfalls:
            'Flex 的主轴受 flex-direction 影响；绝对定位会脱离普通流，父容器不会靠它撑高。未知内容溢出时还需定义滚动和对齐策略。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/CSS/Layout_cookbook/Center_an_element',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '重排（reflow）和重绘（repaint）的区别？如何优化？',
        options: [
          '重排与重绘是同一个阶段',
          '布局计算几何，绘制生成像素；减少强制同步布局并按测量选择合成友好的动画',
          '改颜色一定会重新布局整页',
          'requestAnimationFrame 会自动让任何计算不阻塞页面',
        ],
        answer: 1,
        explain:
          '布局重新计算元素的几何尺寸与位置，绘制生成背景、文字等像素内容，合成把图层组合到屏幕。布局变化通常还会影响绘制；仅颜色变化通常不需要重新布局。优化先在 Performance 中找到实际成本，再减少读写交替引起的同步布局、缩小更新范围并控制节点量。',
        detail: {
          example:
            '循环里先改每行宽度再读 offsetHeight，可能反复迫使浏览器立即结算布局。先集中读取所有旧尺寸，再集中写入；同一帧多次更新可合并。requestAnimationFrame 只安排时机，不能把其中昂贵工作变便宜。',
          pitfalls:
            'transform/opacity 动画在合适的图层条件下可主要由合成处理，但不能承诺永不绘制。opacity:0 仍可能接受点击并参与可访问性树，不能无条件替代 visibility:hidden。',
          sources: [['web.dev · 渲染性能', 'https://web.dev/articles/rendering-performance']],
        },
      },
      {
        type: 'choice',
        q: 'CSS 选择器优先级是怎么计算的？',
        options: [
          '选择器越长总是越优先',
          '先比较层叠条件，再按 ID、类/属性/伪类、类型/伪元素的三元组逐位比较',
          '十个 class 的优先级必然等于一个 ID',
          '!important 是选择器优先级中的第四位数字',
        ],
        answer: 1,
        explain:
          '先看声明是否适用，再按层叠来源、重要性、层等规则决出可比较的声明；选择器优先级只在相同层叠条件内比较。优先级使用 ID、类/属性/伪类、类型/伪元素的三元组逐位比较，不能把它当成十进制 100/10/1 相加。完全打平后才继续比较作用域接近程度和声明顺序。',
        detail: {
          example:
            '#app 的 (1,0,0) 高于十一个 class 的 (0,11,0)。:where(...) 的优先级为 0；:is()、:not()、:has() 采用参数列表中最高优先级，并非这些伪类各额外加一。',
          pitfalls:
            '!important 改变层叠中的重要性，不是选择器加分。内联声明有特殊地位，也会受重要性、动画/过渡等层叠规则影响。排查应看 DevTools 命中的完整声明而非单一数字。',
          sources: [
            ['MDN 官方文档', 'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Specificity'],
          ],
        },
      },
      {
        type: 'choice',
        q: '响应式布局有哪些实现方案？',
        options: [
          '只能用 Bootstrap',
          '1)媒体查询 @media 2)Flex/Grid 弹性布局 3)rem/em/vw/vh 相对单位 4)CSS Container Queries(新特性) 5)picture 标签适配不同分辨率',
          '响应式布局就是缩小页面',
          '只能用 JS 计算屏幕宽度',
        ],
        answer: 1,
        explain:
          '响应式布局通常由弹性尺寸、Flex/Grid、断点和可适配资源组合完成。媒体查询根据视口及设备特征调整布局；容器查询根据声明的查询容器尺寸调整可复用组件；图片用 srcset/sizes 或 picture 控制资源与构图。断点应由内容何时放不下决定。',
        detail: {
          code: '.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1rem; }\n@media (max-width: 40rem) { .toolbar { flex-wrap: wrap; } }\n.panel { container-type: inline-size; }\n@container (max-width: 24rem) { .summary { display: block; } }',
          pitfalls:
            '设置 viewport，保留文字放大与键盘操作能力。测试极长文本、横屏、缩放和触控目标；仅按常见手机宽度截图不能证明内容适配。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Responsive_Design',
            ],
          ],
        },
        chain: 'platform-grid',
      },
      {
        type: 'truefalse',
        q: 'position:sticky 保留普通流位置，并在滚动阈值和包含块边界内调整位置。',
        answer: true,
        explain:
          '正确。sticky 元素仍保留普通流位置，在指定轴设置非 auto 的 inset 后，位置相对最近具有滚动机制的祖先受到约束，并且不能越出自身包含块。它可表现为“到阈值后吸住”，但不会真的切换成 position:fixed。',
        detail: {
          example:
            '表头 position:sticky;top:0 会在所属滚动容器顶部吸附。如果祖先 overflow:hidden 形成了更近的滚动机制祖先，吸附参照可能变了；若该祖先不实际滚动，就可能看不到期望效果。',
          pitfalls:
            '检查 inset、滚动祖先、容器高度、可移动空间及 Flex/Grid 拉伸。overflow:hidden 不等于 sticky 必然失效。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: 'transition 和 animation 都需要触发条件才能开始动画。',
        answer: false,
        explain:
          '错误。transition 通常在可插值属性的计算值发生变化时过渡，例如 class 改变或 hover。animation 在应用 animation-name 等配置后就可按时间线运行，不一定需要用户事件；它可有多个关键帧、重复次数和播放状态。两者都受延迟、持续时间与动画规则控制。',
        detail: {
          example:
            '按钮背景变化可用 transition:background-color .2s；持续旋转的加载图标可用 @keyframes 配合 animation:spin 1s linear infinite。',
          pitfalls:
            '是否触发取决于样式与时间线，不应只分“需要/不需要 hover”。尊重 prefers-reduced-motion，并为动画暂停和隐藏页面设置合适策略。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_animations/Using_CSS_animations',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: 'CSS 中 ::before 和 :before 有什么区别？伪元素和伪类的区别？',
        options: [
          '单冒号写法在所有浏览器中都已失效',
          '::before 是标准伪元素写法，:before 为兼容旧语法保留；伪类选择状态，伪元素表示元素的某个部分或生成盒',
          '所有伪元素都必须写 content 才生效',
          ':hover 会插入一个新的 DOM 元素',
        ],
        answer: 1,
        explain:
          '::before 是伪元素的现代写法，:before 是兼容早期 CSS 的写法，浏览器通常同时支持；新代码优先用双冒号。伪类按状态或结构筛选已有元素，如 :hover、:nth-child；伪元素表示生成盒或元素的一部分，如 ::before、::first-line。',
        detail: {
          code: '.required::before { content: "*"; color: red; }\nbutton:hover { background: #eee; }\np::first-line { font-weight: bold; }',
          pitfalls:
            '::before/::after 通常需要有效 content 才生成内容盒，不能把“必须 content”泛化到 ::first-line 等所有伪元素。生成内容不会成为普通 DOM 子节点，重要业务信息不应只靠它提供。',
          sources: [
            ['MDN 官方文档', 'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::before'],
          ],
        },
      },
      {
        type: 'choice',
        q: 'CSS 中 grid 布局的核心概念？和 flex 的区别？',
        options: [
          'Grid 只能排一行，Flex 只能排一列',
          'Grid 共享行列轨道，可用 fr、minmax、repeat 和区域定位；Flex 每条线分别分配主轴空间',
          'flex-wrap 会让所有换行自动共享同一套列宽',
          'Grid 的所有轨道都必须写固定像素',
        ],
        answer: 1,
        explain:
          'Grid 同时定义行列轨道、网格线和区域，适合需要跨行对齐的二维布局；Flex 沿一个主轴分配空间，即便换行，各行通常独立计算。Grid 的 fr 分配可用空间，minmax 约束轨道范围，gap 定义间距，grid-area 或起止线控制项目位置。',
        detail: {
          code: '.dashboard { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 1rem; }\n.toolbar { display: flex; align-items: center; gap: .5rem; }',
          example:
            '后台侧栏加主内容可用两列 Grid，主内容中的按钮横排用 Flex。卡片需要每行保持相同列线时选 Grid；工具栏按内容伸缩时选 Flex。',
          pitfalls:
            'Grid 项目的最小内容尺寸也可能导致溢出，minmax(0,1fr) 或项目 min-width:0 是否合适取决于内容策略。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Relationship_of_grid_layout_with_other_layout_methods',
            ],
          ],
        },
        chain: 'platform-grid',
      },
      {
        type: 'truefalse',
        q: 'CSS 的 will-change 属性可以提示浏览器提前优化，但不应滥用。',
        answer: true,
        explain:
          '正确。will-change 向浏览器提示某些属性可能变化，使其有机会提前准备，但优化方式由浏览器决定。大量或长期设置可能增加图层和内存成本；应先测量卡顿来源，在确实需要且变化将发生时启用，并在不需要后撤销。',
        detail: {
          example:
            '若确认拖拽首次启动存在图层准备成本，可在交互前为少量目标设置 will-change:transform，结束后恢复 auto。',
          pitfalls: '它不会修复长 JS 任务、无限 DOM 或高频请求，也不保证生成 GPU 图层。',
          sources: [
            [
              'MDN 官方文档',
              'https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/will-change',
            ],
          ],
        },
      },
    ],
  },
  {
    id: 2,
    name: '计算机网络山脉',
    desc: 'HTTP/TCP/UDP/HTTPS',
    difficulty: 'medium',
    icon: '🌐',
    questions: [
      {
        type: 'choice',
        q: '说说从输入 URL 到页面显示的完整过程？',
        options: [
          '就是发个 HTTP 请求然后渲染',
          '先判断导航、缓存与连接复用；按需完成域名解析、传输和 TLS，再请求响应、增量解析资源并布局绘制，脚本执行可能与这些阶段交错',
          '浏览器直接渲染没有网络请求',
          '先渲染再请求',
        ],
        answer: 1,
        explain:
          '以一次没有可复用连接的 HTTPS 导航为例：解析 URL 并检查缓存或 Service Worker；解析域名；建立所用传输及 TLS 会话；发送请求并接收响应；流式解析 HTML、发现 CSS/JS/图片，构建 DOM 与样式数据，计算布局、绘制并合成画面。资源发现、下载、解析和脚本执行会交错，并非先下载完全部内容再渲染。',
        detail: {
          principle:
            'DNS 可命中浏览器、系统或递归解析器缓存。HTTP/1.1、HTTP/2 通常使用 TCP；HTTP/3 使用 QUIC，不能把所有导航都说成先 TCP 三次握手。HTML 中同步经典脚本可能暂停解析，CSS 会影响样式与绘制时机。',
          example:
            '首次访问慢而刷新快，可以分别比较 DNS、连接、TLS、TTFB、内容下载、主线程长任务与 LCP。若 TLS/连接区间为零，先确认是否连接复用，不要把网络建连算成每次请求必付成本。',
          pitfalls:
            'load 事件、首屏可见和交互可用不是同一个完成点。要先选用户目标，再定位该目标前的关键路径。',
          followups: [
            [
              'DNS 很快但首屏仍慢，下一步看什么？',
              '拆开请求首字节等待、资源发现链和主线程工作。用 Network 瀑布与 Performance 对齐，找真正阻塞关键内容呈现的阶段。',
            ],
          ],
          sources: [
            [
              'MDN · 浏览器如何工作',
              'https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/How_browsers_work',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: 'TCP 三次握手的过程？为什么是三次而不是两次？',
        options: [
          '客户端发 SYN 服务端回 ACK 完成',
          'SYN(seq=x)、SYN+ACK(seq=y,ack=x+1)、ACK(ack=y+1)：同步双方序列空间并确认对端接收了本方 SYN，避免仅因迟到旧 SYN 就完成连接',
          '四次握手才能建立连接',
          'TCP 不需要握手',
        ],
        answer: 1,
        explain:
          '主动方发送 SYN，携带初始序列号 x；被动方回 SYN+ACK，确认 x+1 并给出自己的序列号 y；主动方再回 ACK，确认 y+1。连接需要让双方确认对方的发送方向和初始序列号，因此被动方不能仅凭第二个报文就确认对端已收到自己的 SYN。',
        detail: {
          principle:
            'TCP 连接是两个方向的字节流状态。SYN 各消耗一个序列号，第三步确认也帮助避免把过时、重复的建连请求直接当成完整的新连接。连接建立不是简单地数“你能听见我吗”三句话，而是同步双方状态。',
          example:
            '若第三个 ACK 丢失，被动方可能重发 SYN+ACK；主动方收到重复报文后再次确认。携带合适 ACK 的后续数据也参与状态推进，应按状态机分析。',
          pitfalls: '“三次”描述常见建连路径，重传会增加实际报文数；同时打开也有专门状态转换。',
          followups: [
            [
              '第二步为什么把 SYN 和 ACK 放在一起？',
              '确认对端的 SYN 与发送自己的 SYN 可以在同一个段中完成，两个标志承担不同方向的动作。',
            ],
          ],
          sources: [['RFC 9293 · TCP', 'https://www.rfc-editor.org/rfc/rfc9293.html']],
        },
      },
      {
        type: 'choice',
        q: 'TCP 关闭为什么常被描述为四次挥手？一定需要四个报文吗？',
        options: [
          'TCP 两个方向必须在同一瞬间关闭',
          '两个方向独立关闭，接收 FIN 后可能先确认、稍后再发自己的 FIN；若条件允许，ACK 与 FIN 可以合并，因此并非必须四个报文',
          '四次挥手是多余的',
          '只有客户端可以发起关闭',
        ],
        answer: 1,
        explain:
          'TCP 两个方向可以分别关闭。主动方发 FIN，表示自己不会再发送字节；对方先 ACK 确认，但可能还要发送剩余数据；等它也完成发送再发 FIN，主动方最后 ACK。因此常见为四个报文，而非协议强制每次恰好四次。',
        detail: {
          principle:
            '收到 FIN 只表示该方向到达字节流末尾，另一方向可以继续传输。若接收 FIN 的一方已经无数据要发，可以把 ACK 与自身 FIN 合并，抓包就可能看到三个关闭报文。',
          example:
            '客户端上传完毕后半关闭写方向，服务端仍可把计算结果发完，再关闭自身方向。主动关闭方常进入 TIME_WAIT，以处理最终 ACK 丢失后的重传并让旧报文退出网络。',
          pitfalls: '不能用“服务端一定要等固定时间”解释四次挥手；TIME_WAIT 的意义也不只是占住端口。',
          followups: [
            [
              '对方 FIN 后没有马上跟上自己的 FIN，是否一定故障？',
              '不一定，可能仍有待发数据。结合应用协议和连接状态判断；长期停在 CLOSE_WAIT 则常需检查应用是否遗漏关闭。',
            ],
          ],
          sources: [['RFC 9293 · TCP', 'https://www.rfc-editor.org/rfc/rfc9293.html']],
        },
      },
      {
        type: 'choice',
        q: 'TCP 和 UDP 的区别？各自适用什么场景？',
        options: [
          '没区别都是传输协议',
          'TCP 提供可靠有序字节流，适合依赖此语义的应用；UDP 提供独立数据报，适合自行处理时效、重传或在其上实现 QUIC 等传输机制',
          'UDP 比 TCP 更安全',
          'UDP 会自动提供可靠有序的字节流',
        ],
        answer: 1,
        explain:
          'TCP 提供面向连接、可靠且按序的字节流，应用自己定义消息边界；UDP 提供数据报，保留报文边界，但基础协议不承诺重传、按序或去重。文件下载常借助 TCP 的可靠流，实时媒体可以基于 UDP 自行控制迟到、丢包和拥塞；具体协议还可能在 UDP 上补可靠性，例如 QUIC。',
        detail: {
          principle:
            'TCP 通过确认、重传、流控和拥塞控制管理传输；UDP 首部与连接状态较简单，应用可决定哪些过时数据不值得重传。简单并不等于业务层完全不需要可靠性与拥塞处理。',
          example:
            '直播的一帧晚几秒到达可能已无价值，可以丢弃或用纠错；但消息确认、配置和文件必须按各自契约保证完整。HTTP/3 使用 UDP 承载 QUIC，却仍能为 HTTP 流提供可靠传输。',
          pitfalls: '“UDP 一定快、TCP 一定慢”和“UDP 不能可靠传输”都缺少协议与网络条件。',
          followups: [],
          sources: [['RFC 9293 · TCP', 'https://www.rfc-editor.org/rfc/rfc9293.html']],
        },
      },
      {
        type: 'choice',
        q: 'HTTP 和 HTTPS 的区别？HTTPS 的工作原理？',
        options: [
          'HTTPS 就是 HTTP 加了个锁',
          'HTTPS 通过 TLS 提供传输保密、完整性与身份认证；现代握手协商密钥并认证对端，业务数据使用对称认证加密保护',
          'HTTPS 只编码内容，不需要验证服务端身份',
          '只要使用 HTTPS，业务权限漏洞就会消失',
        ],
        answer: 1,
        explain:
          'HTTPS 是把 HTTP 运行在受 TLS 保护的连接上。TLS 提供传输机密性、完整性和对端认证：客户端核验证书与域名等身份条件，握手协商参数并派生密钥，后续 HTTP 数据用对称认证加密传输。HTTP 明文本身不提供这些传输保护。',
        detail: {
          principle:
            '证书链把服务端公钥与可信身份联系起来，握手中的签名与 Finished 验证保护协商过程。现代常见配置使用临时密钥协商，证书公钥并不是直接拿来加密每个业务报文。',
          example:
            '代理若在边缘终止 TLS，浏览器到边缘和边缘到源站是两段链路；“外面是 HTTPS”不能证明内部链路也受同样保护。',
          pitfalls:
            'HTTPS 不会自动解决 XSS、CSRF、越权或服务端业务漏洞。默认端口 443/80 是惯例，不是安全性的定义。',
          followups: [],
          sources: [['RFC 8446 · TLS 1.3', 'https://www.rfc-editor.org/rfc/rfc8446.html']],
        },
      },
      {
        type: 'choice',
        q: 'HTTP 1.0、1.1、2.0、3.0 的区别？',
        options: [
          '版本号不同功能一样',
          '1.1 默认持久连接；2 用二进制帧、流复用和 HPACK，但仍受 TCP 丢包影响；3 在 QUIC 上运行并使用 QPACK，减少不同流之间的传输层阻塞',
          'HTTP/2 每个请求都必须单独建立一条 TCP 连接',
          'HTTP/3 还是用 TCP',
        ],
        answer: 1,
        explain:
          'HTTP/1.0 常以一次请求后关闭连接的方式工作；HTTP/1.1 默认持久连接，并支持分块传输等机制，但管线化响应仍有按序限制。HTTP/2 用二进制帧、多个流与 HPACK 头部压缩在一条连接上复用请求；底层 TCP 丢包仍可挡住其他流。HTTP/3 将 HTTP 映射到 QUIC，使用独立流交付和 QPACK，减少跨流传输层队头阻塞。',
        detail: {
          principle:
            'HTTP 的方法、状态码等语义跨这些版本基本延续，变化重点是连接和消息传输方式。QUIC 集成 TLS 1.3 并支持连接标识，使部分网络切换场景下可以迁移连接。',
          example:
            '同一连接传图片与脚本时，HTTP/2 允许帧交错；TCP 缺一段字节可能阻塞两者。HTTP/3 若只丢了图片流的数据，已完整到达的脚本流仍可继续交付。',
          pitfalls:
            'HTTP/3 不消除带宽竞争、拥塞或应用依赖，UDP 受限网络还可能回退。不能按版本号直接承诺页面更快。',
          followups: [],
          sources: [['MDN · HTTP 概览', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview']],
        },
        chain: 'net-h3',
      },
      {
        type: 'choice',
        q: '常见 HTTP 状态码？301 和 302 的区别？',
        options: [
          '200 就是成功其他不重要',
          '2xx 表示成功、3xx 为重定向或缓存验证、4xx 为请求相关错误、5xx 为服务器处理失败；301 是永久重定向，302 是临时重定向',
          '301 和 302 完全一样',
          '4xx 是服务端错误',
        ],
        answer: 1,
        explain:
          '可按类别回答：2xx 为成功，如 200、创建资源的 201、无响应内容的 204；3xx 处理重定向或缓存验证，如 301、302、304；4xx 表示客户端请求相关问题，如 400、401、403、404、409、429；5xx 表示服务器或网关问题，如 500、502、503、504。301 表示永久迁移，302 表示临时位置，都会通过 Location 指明新地址。',
        detail: {
          principle:
            '对历史客户端行为，301/302 可能把 POST 改为 GET；需要保留请求方法时应考虑 307 临时或 308 永久重定向。缓存行为还受响应头和方法影响，不能只用“301 一定缓存、302 一定不缓存”概括。',
          example:
            '未登录访问受保护接口可返回 401 并给出认证信息；已识别身份但无权限通常用 403；更新版本冲突可用 409；上游超时由网关返回 504。错误响应同时给稳定业务码与关联号，便于客户端恢复。',
          pitfalls: '304 没有新的表示正文，浏览器合并响应元数据并复用已有表示；它不是跳到另一个 URL。',
          followups: [
            [
              '登录接口 POST 后想转到结果页面，如何避免浏览器重发 POST？',
              '可使用 303 See Other，让后续取结果通常使用 GET；仍要按实际接口契约设计跳转。',
            ],
          ],
          sources: [['MDN · HTTP 概览', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview']],
        },
      },
      {
        type: 'choice',
        q: 'GET 和 POST 的区别？',
        options: [
          '没区别都能传数据',
          'GET 用于获取表示且语义安全、幂等；POST 用于按资源约定处理请求内容，通常不保证幂等；长度、缓存与保密不能仅凭方法名断言',
          'POST 比 GET 更安全因为加密了',
          'GET 不能传参数',
        ],
        answer: 1,
        explain:
          'GET 的语义是获取资源表示，按协议应是安全且幂等的；POST 把数据交给目标资源处理，通常用于提交或创建，不能默认自动重试。二者的关键区别是语义、缓存与重试契约，不是“GET 明文、POST 加密”。HTTPS 才提供传输加密。',
        detail: {
          principle:
            'GET 参数常放 URL 查询串，容易进入历史、日志和分享链接，不应承载秘密；POST 常用请求体，但 URL 也可带查询串。HTTP 并没有统一的 GET 长度上限，限制来自客户端、代理和服务端。POST 响应也可在明确缓存语义下缓存。',
          example:
            '查询文档使用 GET /files?id=123；创建审批使用 POST /approvals，并按业务设计幂等键。重复 GET 允许统计日志等附带效果，安全语义指用户请求的主要效果不应修改业务状态。',
          pitfalls:
            'GET 请求体没有通用定义的业务语义，跨系统不要依赖它。把删除接口写成 GET 会导致预取、链接扫描等触发意外操作。',
          followups: [],
          sources: [
            ['MDN · HTTP 请求方法', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods'],
          ],
        },
      },
      {
        type: 'choice',
        q: '什么是跨域？怎么解决？',
        options: [
          '跨域就是页面在不同浏览器打开',
          '协议、主机或有效端口不同即不同源；跨源读取可由服务端 CORS 授权，也可通过受控同源代理组织请求，不能靠前端删除浏览器限制',
          '跨域问题只出现在 IE',
          '前端设置 Access-Control-Allow-Origin 请求头就能授权自己读取任意响应',
        ],
        answer: 1,
        explain:
          '浏览器页面的协议、主机、端口与目标不一致即跨源。同源策略主要限制脚本读取跨源响应和直接操作跨源文档。常用解决是服务端正确配置 CORS，或让浏览器请求同源 BFF/反向代理，由服务端访问下游；不能靠前端加一个允许头解除限制。',
        detail: {
          principle:
            '不满足简单请求条件时，浏览器先发 OPTIONS 预检，检查允许的源、方法和请求头。带凭据时需要客户端开启 credentials、服务端明确允许凭据并返回具体允许源，不能将 Allow-Origin 配成 *。Cookie 的 SameSite 和第三方 Cookie 策略还独立生效。',
          example:
            '页面 https://app.example 请求 https://api.example 的 JSON POST，Content-Type: application/json 会触发预检。实际响应也要带对应 CORS 头，仅 OPTIONS 返回正确仍可能读不到正文。',
          pitfalls:
            '跨域不等于请求一定没发出去。JSONP 会执行远端脚本，只有旧 GET 接口等有限场景，不能作为通用安全方案。',
          followups: [],
          sources: [['MDN · CORS', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS']],
        },
        chain: 'origin',
      },
      {
        type: 'choice',
        q: 'XSS 攻击和 CSRF 攻击是什么？怎么防御？',
        options: [
          '都是服务器被黑了',
          'XSS 使不可信内容以受害站点权限执行，靠安全输出和清理等防护；CSRF 利用浏览器携带身份凭据发起非预期请求，需令牌、来源校验及合适 SameSite 等防护',
          'XSS 和 CSRF 是同一种攻击',
          'HTTPS 能完全防止 XSS',
        ],
        answer: 1,
        explain:
          'XSS 是不可信内容在受害站点上下文中被当作代码执行；CSRF 是攻击者诱导浏览器携带已有身份去执行非预期请求。前者重在内容解释边界，后者重在请求来源与用户意图。防 XSS 用上下文正确的编码、安全 DOM API、富文本净化和 CSP；防 CSRF 用令牌、适当 SameSite、Origin 验证等服务端机制。',
        detail: {
          principle:
            '普通文本用 textContent 或框架默认插值；富文本需要净化允许的标签、属性与 URL 协议。Cookie 身份会被浏览器自动带上，所以状态变更应验证与会话绑定的 CSRF 令牌。HttpOnly 限制读 Cookie，却不能阻止已运行的恶意脚本代用户发请求。',
          example:
            '把评论直接放进 innerHTML 是 XSS 风险；第三方站点诱导提交带登录 Cookie 的转账请求是 CSRF 风险。两个问题可以同时存在，修复一个不等于修复另一个。',
          pitfalls:
            'CORS 主要控制浏览器脚本读取响应，不能代替 CSRF 防护。资金操作还要做资源授权和业务状态校验。',
          followups: [],
          sources: [
            [
              'OWASP · CSRF 防护',
              'https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html',
            ],
          ],
        },
        chain: 'sec-richtext',
      },
      {
        type: 'truefalse',
        q: 'HTTP 的无状态性意味着应用服务器无法识别同一用户的连续请求。',
        answer: false,
        explain:
          'HTTP 语义不要求服务器自动记住前一次请求的会话上下文，这是“无状态”。应用可以显式通过 Cookie、令牌或请求标识关联用户，再读取服务端会话，所以不能推导成服务器永远不知道是谁，也不能把 TCP 连接是否复用等同于登录状态。',
        detail: {
          principle:
            '每次请求应携带处理它所需的认证和资源信息；持久连接仅复用传输通道，同一连接上的请求仍按 HTTP 语义独立处理。',
          example:
            '第一次登录拿到会话 Cookie，下一次请求附带会话标识，服务端据此找到用户。这是应用建立的状态机制。',
          pitfalls: '原命题把协议无状态和应用无法识别用户混为一谈，应判错误。',
          followups: [],
          sources: [['MDN · HTTP 概览', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview']],
        },
      },
      {
        type: 'truefalse',
        q: '304 状态码表示服务器返回了新的内容。',
        answer: false,
        explain:
          '错误。304 Not Modified 表示条件请求验证结果允许继续使用已有表示，响应不带新的资源正文。常见过程是客户端带 If-None-Match，服务端比较 ETag 后返回 304，客户端更新相关缓存元数据并使用原正文。若资源已变化，通常返回 200 和新表示。',
        detail: {
          principle:
            'no-cache 表示重用前要验证，不等于禁止存储；no-store 才要求不存储。验证器让缓存失效后的更新无需每次传完整正文。',
          example:
            '客户端有 ETag "v7"，发送 If-None-Match: "v7"；源站仍是 v7 则回 304，已到 v8 则回 200 和新 ETag。',
          pitfalls: '若客户端根本没有可复用正文，异常地收到 304 不能凭空构造内容，需要检查缓存或代理行为。',
          followups: [],
          sources: [['MDN · HTTP 缓存', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching']],
        },
        chain: 'network',
      },
      {
        type: 'truefalse',
        q: '在传统服务端 Session 模型中，浏览器 Cookie 通常保存会话标识，服务端保存对应会话数据。',
        answer: true,
        explain:
          '在传统服务端会话模型中，这个说法成立：浏览器保存 Cookie，Cookie 常只携带不透明 session ID；服务器用该 ID 查会话数据。但 Cookie 与 Session 不是同一层概念，Cookie 是传送/存储机制，会话也可能采用签名 Cookie 等其他实现，不能据此断言所有会话数据必在服务器。',
        detail: {
          principle:
            '会话标识要有足够随机性，登录或权限变化时按策略更新，退出时撤销服务端会话并过期 Cookie。Cookie 的发送受域、路径、Secure、SameSite 等条件约束。',
          example:
            'Cookie: sid=随机标识；Redis 中 sid 映射到用户与到期时间。浏览器只提交 sid，服务端仍逐请求核对会话与资源权限。',
          pitfalls:
            '把 session ID 放进 Cookie 不会自动获得完整安全；还要考虑 XSS、CSRF、固定会话和失效机制。',
          followups: [],
          sources: [['MDN · HTTP 概览', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview']],
        },
        chain: 'sec-session',
      },
      {
        type: 'choice',
        q: 'TCP 如何保证可靠传输？流量控制和拥塞控制的区别？',
        options: [
          'TCP 不保证可靠性',
          '序列号、确认、校验与重传支持有序可靠交付；接收窗口保护接收端，拥塞窗口及相应算法控制对网络路径的压力',
          '流量控制和拥塞控制是同一个机制',
          'TCP 没有拥塞控制',
        ],
        answer: 1,
        explain:
          'TCP 用序列号组织字节，用 ACK、重传和校验等机制检测缺失或损坏并提供按序可靠交付。流量控制保护接收端：接收方通告 rwnd，限制发送方尚未确认的数据量；拥塞控制保护网络路径：发送端依据丢包、延迟等信号调整 cwnd。发送上限同时受两者约束。',
        detail: {
          principle:
            'TCP 是字节流而非应用消息队列。慢启动、拥塞避免等是经典算法框架，具体实现可用 CUBIC、BBR 等，不能把所有连接都背成同一组固定增减公式。',
          example:
            '接收应用处理慢会使接收窗口缩小，即使链路空闲也不能无限发；网络排队或丢包会使拥塞算法限制速率，即使接收端还有大量缓冲也一样。',
          pitfalls:
            '传输可靠不代表应用处理只发生一次。支付响应丢失后重试是否重复执行，仍需业务幂等与结果查询。',
          followups: [],
          sources: [['RFC 9293 · TCP', 'https://www.rfc-editor.org/rfc/rfc9293.html']],
        },
      },
      {
        type: 'choice',
        q: 'HTTPS 的 TLS 握手过程？TLS 1.3 相比 1.2 的优化？',
        options: [
          'TLS 握手就是交换密码',
          '常见 TLS 1.3 完整握手协商参数和共享秘密、验证证书与握手签名，再派生流量密钥；常规握手减少往返，恢复的 0-RTT 早期数据有重放风险',
          'TLS 1.3 的 0-RTT 可以安全重放任意资金请求',
          'TLS 1.3 使用 RSA 密钥传输作为唯一密钥协商机制',
        ],
        answer: 1,
        explain:
          '以证书认证的 TLS 1.3 完整握手为例：客户端 ClientHello 携带支持参数和密钥共享；服务端 ServerHello 选定参数并给出密钥共享，随后发送加密的握手信息、证书、签名证明与 Finished；客户端验证身份和握手完整性后发送自己的 Finished。双方派生业务流量密钥，使用对称认证加密。',
        detail: {
          principle:
            '相比常见 TLS 1.2 完整握手，TLS 1.3 通常把 TLS 握手往返减少到 1-RTT，并移除旧密码套件、强制更现代的密钥协商与认证加密。会话恢复可用 PSK；允许 0-RTT 时，客户端可提前发数据，但早期数据有重放风险。',
          example:
            '查询公开静态资源或许可接受早期数据；提交分账不能因为能 0-RTT 就直接提前执行，需要避开非幂等副作用或按协议与业务约束处理。',
          pitfalls:
            '这里的 RTT 是 TLS 层常见条件下的描述，不能把 TCP 建连、证书校验、回退和整个页面下载都算成一次 RTT。',
          followups: [],
          sources: [['RFC 8446 · TLS 1.3', 'https://www.rfc-editor.org/rfc/rfc8446.html']],
        },
      },
      {
        type: 'choice',
        q: '什么是 CDN？它的工作原理？CDN 加速的本质是什么？',
        options: [
          'CDN 就是一个更大的服务器',
          'CDN 将请求调度到合适边缘节点，命中可缓存内容时就地返回，未命中时按策略回源；收益来自路径优化、连接与缓存复用，节点并非必定物理最近',
          'CDN 只能加速动态请求',
          'CDN 和 DNS 无关',
        ],
        answer: 1,
        explain:
          'CDN 把内容交付能力部署到多个边缘位置，通过 DNS、Anycast 或其他调度把请求送到合适节点。边缘命中缓存就直接返回；未命中或需要验证时回源。收益来自缩短交付路径、复用连接、减少源站工作和分散流量，实际节点选择也考虑网络质量与负载。',
        detail: {
          principle:
            '缓存键决定哪些请求可复用同一份内容；TTL、验证器、Vary、版本文件名和清除策略决定更新何时可见。静态资源适合长缓存并用内容哈希命名，个性化内容必须明确身份与共享缓存边界。',
          example:
            '同一帮助页按语言变化时，只有 URL 作为键会串语言；需加入正确的语言维度。登录用户资料若错误进入公共缓存，命中率越高，错误影响反而越大。',
          pitfalls:
            'CDN 不仅能缓存静态文件，也可提供动态路径优化等能力；“离用户地理距离最近”不是唯一调度标准。',
          followups: [],
          sources: [['MDN · HTTP 缓存', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching']],
        },
        chain: 'net-vary',
      },
      {
        type: 'choice',
        q: 'WebSocket 和 HTTP 的区别？为什么需要 WebSocket？',
        options: [
          'WebSocket 就是 HTTP 的一个版本',
          'HTTP 提供请求响应语义，SSE 可持续下发服务端事件；WebSocket 提供双向消息通道，适合频繁双向交互，仍需处理认证、积压和重连',
          'WebSocket 需要多次 TCP 连接',
          'WebSocket 自动保存全部断线消息并在重连后恰好投递一次',
        ],
        answer: 1,
        explain:
          'HTTP 提供请求/响应语义，适合查询、提交和资源交付；WebSocket 建立持久的双向消息通道，客户端和服务端都可独立发送消息，适合频繁互动。服务端单向事件也可用 HTTP 上的 SSE，因此“HTTP 完全不能推送”不准确。',
        detail: {
          principle:
            '经典 HTTP/1.1 WebSocket 握手通过 Upgrade 请求和 101 响应切换协议；其他 HTTP 版本有对应机制。建立通道后仍要设计心跳、断线恢复、鉴权、顺序号、去重和积压上限，这些并非 WebSocket 自动解决。',
          example:
            '审批结果通知如果主要服务端推送，可用 SSE 加普通 HTTP 提交；多人交互或双向高频状态可考虑 WebSocket。选择应比较代理支持、恢复成本和实际消息模式。',
          pitfalls:
            '浏览器 WebSocket API 不会自动为应用实现持久消息重放；TCP 连接可靠也不代表断线期间的消息可恢复。',
          followups: [],
          sources: [['MDN · HTTP 概览', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview']],
        },
        chain: 'socket',
      },
      {
        type: 'truefalse',
        q: 'HTTP/2 多路复用消除了 HTTP/1.1 管线化必须按序返回响应的限制，但仍受底层 TCP 丢包影响。',
        answer: true,
        explain:
          '在 HTTP/1.1 管线化响应必须按序返回这一层面，HTTP/2 多路复用消除了该限制。但多个 HTTP/2 流仍承载在同一 TCP 字节流上，TCP 丢包的按序交付会让多个流一起等待。因此要明确“解决的是哪一层的队头阻塞”。',
        detail: {
          principle:
            'HTTP/3 的 QUIC 给不同流独立的有序交付，减少这种跨流等待；同一流内部仍须补齐数据，连接的带宽与拥塞控制也仍共享。',
          example:
            '图片流中某个 TCP 段丢失，后面收到的脚本字节可能无法交给 HTTP/2；这并不是 HTTP/2 不支持多路复用，而是底层交付边界。',
          pitfalls: '题干限定为 HTTP/1.1 管线化层面的限制时才判正确。',
          followups: [],
          sources: [['MDN · HTTP 概览', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview']],
        },
        chain: 'net-h3',
      },
      {
        type: 'truefalse',
        q: 'HTTPS 使用非对称加密传输所有数据保证安全。',
        answer: false,
        explain:
          '错误。HTTPS 的大量业务数据通常使用高效的对称认证加密。非对称密码机制主要参与身份认证和密钥协商；例如 TLS 1.3 中 ECDHE 协商共享秘密，证书签名证明服务端身份，随后派生对称流量密钥。',
        detail: {
          principle:
            '“非对称加密更安全，所以全部用它”混淆了算法角色。协议还要保证握手完整性、密钥派生和重放边界。',
          example: '服务端证书验证成功之后，每个响应体并不会逐字节交给证书公钥做加密。',
          pitfalls: 'TLS 具体套件与恢复路径有差异，应先说明采用的握手类型。',
          followups: [],
          sources: [['RFC 8446 · TLS 1.3', 'https://www.rfc-editor.org/rfc/rfc8446.html']],
        },
      },
    ],
  },
  {
    id: 3,
    name: 'Vue 阵营',
    desc: 'Vue3 响应式与生态',
    difficulty: 'medium',
    icon: '💚',
    questions: [
      {
        type: 'choice',
        q: 'Vue3 的响应式原理？和 Vue2 有什么区别？',
        options: [
          'Vue 3 继续仅用 defineProperty 遍历全部属性',
          'Vue 2 主要拦截已有属性，Vue 3 用 Proxy 跟踪对象操作，ref 跟踪 .value；依赖变化调度相关更新',
          'Proxy 会让所有对象操作自动变成异步',
          'Vue 3 修改任何字段都会重新创建全部组件',
        ],
        answer: 1,
        explain:
          'Vue 2 主要通过为已有属性安装 getter/setter 收集依赖和触发更新，并对部分数组方法做补丁；新增/删除属性、数组索引直接赋值存在限制。Vue 3 的 reactive 通过 Proxy 拦截读取、设置、删除、遍历等操作，读取时记录当前 effect 对属性的依赖，变化时调度关联 effect。ref 则通过 .value 的访问跟踪。',
        detail: {
          principle:
            '依赖关系可理解为 target → key → effects。组件渲染也是读取响应式值的 effect；修改只通知使用过相关值的订阅，DOM 更新通常批量调度。嵌套对象访问时可转换为代理。',
          example:
            '模板只读取 state.name，修改未被读取的独立字段不应被理解为必然重建整页。给原始对象加字段与给 reactive 返回的代理加字段不是同一条拦截路径。',
          pitfalls:
            'Proxy 解决可拦截操作范围，不保证所有场景性能必然更快；原始对象与代理身份不同，解构原始值会断开属性访问。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/extras/reactivity-in-depth.html']],
        },
        chain: 'vue',
      },
      {
        type: 'choice',
        q: 'Vue3 的 Composition API 解决了什么问题？',
        options: [
          '让代码看起来更复杂',
          '解决 Options API 中相关逻辑散落在 data/methods/computed/watch 各处的问题；按功能组织代码逻辑复用从 mixin 升级为 composable 函数无命名冲突来源清晰',
          'Composition API 取代了 Options API',
          'Composition API 性能更好',
        ],
        answer: 1,
        explain:
          'Composition API 让同一功能的状态、派生值、监听和生命周期逻辑放在一起，并可封装为 composable。它改善大型组件按 data/methods/watch 分散组织的问题，也使跨组件复用的输入、输出和依赖更明确。它与 Options API 可以共存，不等于要求所有逻辑都写进一个庞大的 setup。',
        detail: {
          code: 'import { ref, onMounted, onUnmounted } from "vue";\nexport function useWindowWidth() {\n  const width = ref(0);\n  const update = () => { width.value = window.innerWidth; };\n  onMounted(() => { update(); window.addEventListener("resize", update); });\n  onUnmounted(() => window.removeEventListener("resize", update));\n  return { width };\n}',
          example:
            '列表页可拆出 useSelection、usePermission 和 useUpload，各自暴露明确能力，页面负责组合。相比隐式混入的 mixin，命名冲突与数据来源更容易追踪。',
          pitfalls: 'Composable 仍要定义实例范围和清理行为；模块顶层可变状态可能在 SSR 请求间共享。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/reusability/composables.html']],
        },
      },
      {
        type: 'choice',
        q: 'Vue 的生命周期钩子有哪些？在哪发请求？在哪销毁？',
        options: [
          '只有 created 和 mounted 两个',
          'setup(替代 beforeCreate/created) onBeforeMount onMounted(发请求) onBeforeUpdate onUpdated onBeforeUnmount(清理) onUnmounted',
          '在 beforeCreate 发请求最好',
          '不需要手动清理',
        ],
        answer: 1,
        explain:
          'Composition API 中常用 onBeforeMount/onMounted、onBeforeUpdate/onUpdated、onBeforeUnmount/onUnmounted；setup 负责初始化，取代许多 beforeCreate/created 场景。依赖 DOM 的工作在 mounted 后执行。普通数据请求可在 setup、事件或 watch 中按需求启动，涉及 SSR 时采用框架的数据获取方案。卸载时清理监听、定时器、连接与失效请求。',
        detail: {
          code: 'import { onMounted, onUnmounted } from "vue";\nconst controller = new AbortController();\nonMounted(() => {\n  fetch("/api/items", { signal: controller.signal }).catch(error => {\n    if (error.name !== "AbortError") console.error(error);\n  });\n});\nonUnmounted(() => controller.abort());',
          pitfalls:
            '生命周期注册应在 setup 同步执行期间进行。KeepAlive 切走通常是 deactivated，不是每次都卸载；仅放 onUnmounted 的轮询清理可能不够。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/essentials/lifecycle.html']],
        },
        chain: 'frame-route',
      },
      {
        type: 'choice',
        q: 'computed 和 watch 的区别？什么时候用哪个？',
        options: [
          'computed 和 watch 都只在创建时执行一次',
          'computed 缓存纯派生值，watch 显式监听源并执行副作用；watch 回调的返回值不是派生状态',
          'watch 无法取消过期请求',
          'computed 的 getter 适合提交订单等写操作',
        ],
        answer: 1,
        explain:
          'computed 表示由响应式输入推导的值，按依赖缓存结果，getter 应保持纯计算；watch 在显式源变化时执行副作用，可得到新旧值并处理异步请求。合计金额、过滤结果用 computed；保存草稿、请求远端校验等用 watch。watchEffect 自动跟踪同步读取的依赖，适合简单副作用。',
        detail: {
          code: 'const total = computed(() => price.value * quantity.value);\nwatch(userId, async (id, _old, onCleanup) => {\n  const c = new AbortController();\n  onCleanup(() => c.abort());\n  try {\n    const response = await fetch(`/api/users/${id}`, {signal: c.signal});\n    const value = await response.json();\n    if (!c.signal.aborted) user.value = value;\n  } catch (error) { if (error.name !== "AbortError") throw error; }\n});',
          pitfalls:
            'computed 中 Date.now 等非响应式输入不会自行失效；watch 默认不是深度遍历所有对象，深度监听还可能有成本。异步旧响应需取消或检查代际。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/essentials/watchers.html']],
        },
        chain: 'vue',
      },
      {
        type: 'choice',
        q: 'Vue 虚拟 DOM 和 diff 算法怎么工作？',
        options: [
          'Vue 更新总是删除全部 DOM 后重建',
          'VNode 描述界面，Vue 3 的 keyed diff 同步头尾、匹配中间节点并用最长递增子序列减少移动；编译信息还能跳过静态部分',
          'Vue 3 的 keyed diff 与 Vue 2 的双端交叉比较过程完全相同',
          '每次随机生成 key 可以提升组件复用率',
        ],
        answer: 1,
        explain:
          'Vue 将模板编译为渲染函数，执行后得到描述节点的 VNode 树；状态变化时生成新描述，通过 patch 比较并复用对应 DOM/组件。对带 key 的列表，可先同步头尾、处理新增删除，再为中间段建立映射，并用最长递增子序列减少保留节点的移动。',
        detail: {
          example:
            '旧序列 A B C，新序列 B A C：稳定 key 让组件身份仍属于同一业务项，算法调整节点位置而不是把 A 的输入态交给 B。类型不同或 key 不同可能触发卸载重建。',
          pitfalls:
            'Vue 3 的编译器可标记动态节点和属性以跳过部分比较。虚拟 DOM 本身不是“比直接操作 DOM 总快”的保证；列表规模和更新范围仍影响成本。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/extras/rendering-mechanism.html']],
        },
        chain: 'keys',
      },
      {
        type: 'choice',
        q: 'v-if 和 v-show 的区别？',
        options: [
          'Node 中每个 setTimeout 都创建一条专属 JavaScript 线程',
          'v-if 真正条件渲染(销毁/重建初始开销小切换开销大适合不频繁切换)；v-show CSS display 控制(始终渲染初始开销大切换开销小适合频繁切换)',
          'v-show 不渲染 DOM',
          'v-if 性能永远比 v-show 好',
        ],
        answer: 1,
        explain:
          'v-if 按条件创建或销毁分支内的元素与子组件，初始条件为 false 时可跳过该分支创建；v-show 始终保留元素，通过 display 切换可见性。频繁显示隐藏且希望保留实例状态时常选 v-show；低频、内容昂贵且不需要保留时常选 v-if。',
        detail: {
          example:
            '权限不足时根本不需要创建编辑面板，可用 v-if；用户频繁展开折叠的轻量工具栏可用 v-show。组件被 v-show 隐藏后定时器仍可能运行。',
          pitfalls:
            '两者都是前端呈现手段，无法替代接口权限。v-show 的初始渲染成本仍存在；v-if 的频繁销毁重建可能丢草稿和焦点。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/essentials/conditional.html']],
        },
      },
      {
        type: 'choice',
        q: 'Vue 组件通信有哪些方式？',
        options: [
          '只能通过 props',
          '父→子：props/ref；子→父：emit；兄弟：mitt/状态管理；跨层级：provide/inject；全局状态：Pinia',
          'Vue 组件不能通信',
          '只能用全局变量',
        ],
        answer: 1,
        explain:
          '父子通信常用 props 下传、emit 上报事件，组件 v-model 是 prop 与更新事件的协定；跨多层共享上下文可用 provide/inject；跨页面持续共享状态可用 Pinia。插槽让父级提供渲染内容，模板 ref/expose 可提供少量命令式接口。事件总线适合离散通知，必须管理订阅生命周期。',
        detail: {
          code: '// 子组件（兼容显式 modelValue 协定）\nconst props = defineProps({ modelValue: String });\nconst emit = defineEmits(["update:modelValue"]);\nfunction update(value) { emit("update:modelValue", value); }\n// 父组件模板：<SearchBox v-model="query" />',
          pitfalls:
            '不要从子组件直接改 props 或用事件总线隐藏所有领域依赖。选择通信方式前先确定状态所有者、需要返回结果还是通知、以及保留多久。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/components/component-basics.html']],
        },
      },
      {
        type: 'choice',
        q: 'Pinia 和 Vuex 的区别？为什么 Vue3 推荐用 Pinia？',
        options: [
          'Pinia 与 Vuex 的 API 和状态修改约束完全相同',
          'Pinia 不要求 mutation，按 store 定义状态与 action，组合式 API 和 TypeScript 集成更直接；SSR 仍要隔离应用状态',
          'Pinia 会自动把所有状态写入浏览器持久存储',
          'Pinia 只能定义一个 store',
        ],
        answer: 1,
        explain:
          'Pinia 将 store 分开定义，支持 state/getters/actions 和较自然的 TypeScript 推断；修改状态可直接进行或封装在 action 中，不需要 Vuex 的 mutation 层。Vuex 以 state/getters/mutations/actions 和模块组织状态。选择 Pinia 的价值在于更简洁的 API、开发工具和当前 Vue 生态支持，迁移时仍要保留业务状态与持久化契约。',
        detail: {
          example:
            '购物车 action 统一处理加购规则，getter 计算金额。组件用 storeToRefs 取得需保持响应性的状态/getter，action 可以直接解构调用。',
          pitfalls:
            '多个 store 是领域模块，不代表浏览器只能有一个全局 store；SSR 必须按应用/请求隔离 Pinia 实例。库体积依赖版本和打包方式，不宜背固定 1KB。',
          sources: [['Pinia · 核心概念', 'https://pinia.vuejs.org/core-concepts/']],
        },
        chain: 'frame-store',
      },
      {
        type: 'truefalse',
        q: '在普通 JavaScript 中，ref 通常通过 .value 访问，reactive 对象直接访问属性；模板存在 ref 解包规则。',
        answer: true,
        explain:
          '在普通 JavaScript 中读取或修改 ref 的值通常使用 .value；reactive 返回的代理则直接访问属性。模板会在一定规则下自动解包顶层 ref，深层 reactive 对象属性也有 ref 解包行为，但 reactive 数组和原生集合中的 ref 通常仍需 .value。',
        detail: {
          code: 'const count = ref(0);\ncount.value++;\nconst state = reactive({ count: 0 });\nstate.count++;\nconst rows = reactive([ref(1)]);\nconsole.log(rows[0].value); // 数组元素不按对象属性自动解包',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/essentials/reactivity-fundamentals.html']],
        },
        chain: 'vue',
      },
      {
        type: 'truefalse',
        q: 'Vue 中用 index 作为 key 没有任何问题。',
        answer: false,
        explain:
          '错误。key 参与识别同一组件或 DOM 节点的身份。使用数组下标时，删除或重排会让同一位置对应不同业务项，导致旧局部输入、焦点或选择状态跟错行。优先使用稳定、同级唯一的业务 ID；没有现成 ID 的新行可在创建时生成一次。',
        detail: {
          example:
            '两行 A、B 分别 key=0、1，删除 A 后 B 变成 key=0，原 A 对应实例可能被拿来显示 B。若该实例保留未受控输入，就会显示错误草稿。',
          pitfalls:
            '无状态、不会重排的静态列表使用 index 可能没有可见问题，但不符合“没有任何问题”的绝对说法。随机 key 会让每次渲染都重建。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/essentials/list.html']],
        },
        chain: 'keys',
      },
      {
        type: 'truefalse',
        q: 'Vue3 的 nextTick 作用是在下次 DOM 更新后执行回调。',
        answer: true,
        explain:
          '正确。修改响应式状态后，Vue 通常把 DOM 更新合并到稍后的调度批次；await nextTick() 等待这一批 DOM 更新完成后再继续，适合读取更新后的元素尺寸或聚焦新元素。它不保证浏览器已经绘制，也不等待图片、字体或网络请求全部结束。',
        detail: {
          code: 'import { ref, nextTick } from "vue";\nconst open = ref(false);\nasync function show() {\n  open.value = true;\n  await nextTick();\n  // 此时可访问由 open 控制的新 DOM；图片最终尺寸仍可能变化\n}',
          sources: [['Vue 官方文档', 'https://vuejs.org/api/general.html#nexttick']],
        },
        chain: 'vue',
      },
      {
        type: 'choice',
        q: 'Vue 的 keep-alive 是什么？有什么用？',
        options: [
          'keep-alive 就是让组件永远不销毁',
          '缓存不活动的组件实例避免重复渲染保留状态；有 include/exclude 控制哪些组件缓存 max 控制缓存上限；activated/deactivated 是缓存组件的生命周期；场景：Tab 切换保留滚动位置/表单输入',
          'keep-alive 会增加内存但不能保留状态',
          'keep-alive 不需要配置',
        ],
        answer: 1,
        explain:
          'KeepAlive 缓存动态组件实例，使切换回来时保留组件状态。include/exclude 按组件名决定缓存范围，max 限制实例数量，并按近期使用情况淘汰。被缓存组件切走时进入 deactivated，回来进入 activated；最终淘汰时仍需销毁清理。',
        detail: {
          code: '<KeepAlive :max="3" include="FileList,ReportEditor">\n  <component :is="currentView" />\n</KeepAlive>',
          example:
            '列表到详情再返回时可保留筛选输入；轮询应在失活时暂停，激活时幂等恢复。远端权限和数据是否过期要另行刷新。',
          pitfalls:
            '缓存是以内存换重建成本，不保证所有 DOM、网络和业务状态永远有效；长时间保留实例也可能增加内存。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/built-ins/keep-alive.html']],
        },
        chain: 'frame-keepalive',
      },
      {
        type: 'choice',
        q: 'Vue3 中 ref 和 reactive 的区别？什么时候用哪个？',
        options: [
          'ref 只能包装数字，reactive 只能包装数组',
          'ref 可包装原始值或对象并通过 .value 整体替换；reactive 代理对象，选择取决于状态形态和身份保持方式',
          '解构 reactive 中的普通数字后仍自动关联原属性',
          'ref 包装的对象永远不会转成响应式对象',
        ],
        answer: 1,
        explain:
          'ref 可包装原始值或对象，适合需要整体替换的状态，代码中通过 .value 操作；对象值默认会转换为深层响应式对象。reactive 用于对象、数组和集合，保留代理身份后直接访问属性。选型主要看状态形态和替换方式，不能简单规定“所有对象必须 reactive”。',
        detail: {
          code: 'const form = ref({ name: "A" });\nform.value = { name: "B" }; // 整体切换\nconst state = reactive({ count: 1 });\nconst count = toRef(state, "count");\ncount.value++; // 与 state.count 关联',
          pitfalls:
            '解构 reactive 的原始值会得到快照；解构嵌套代理仍可追踪其属性，但替换原属性不会更新已持有的旧对象。shallowRef 只跟踪 .value 替换，适合外部大型对象或实例，不是无条件更快。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/essentials/reactivity-fundamentals.html']],
        },
        chain: 'vue',
      },
      {
        type: 'choice',
        q: 'Vue 的插槽(Slot)有哪几种？作用域插槽怎么用？',
        options: [
          '只有默认插槽一种',
          '默认插槽(父内容注入子) 具名插槽(v-slot:name/#name 多个出口) 作用域插槽(子传数据给父父用 slotProps 渲染)；场景：列表组件让父控制每项渲染方式',
          '作用域插槽不需要传数据',
          '具名插槽只能有一个',
        ],
        answer: 1,
        explain:
          '默认插槽提供一个未命名内容入口，具名插槽给 header/footer 等多个区域命名；作用域插槽允许子组件在调用插槽时传数据，由父组件决定渲染。父级插槽内容按父级作用域编译，只有子组件显式传出的 slot props 才能作为参数使用。',
        detail: {
          code: '<!-- 子组件 RowList.vue 的一行 -->\n<slot :item="item" :index="index">{{ item.name }}</slot>\n<!-- 父组件 -->\n<RowList>\n  <template #default="{ item, index }">\n    <strong>{{ index + 1 }}. {{ item.name }}</strong>\n  </template>\n</RowList>',
          example:
            '表格负责分页、数据与行循环，调用方通过单元格插槽渲染状态标签或操作按钮。这样复用行为而不固定所有展示。',
          pitfalls: '作用域插槽是渲染参数传递，不会让父组件直接访问子组件任意内部状态。',
          sources: [['Vue 官方文档', 'https://vuejs.org/guide/components/slots.html']],
        },
      },
      {
        type: 'truefalse',
        q: 'Vue3 的 setup 语法糖（<script setup>）中组件不需要注册可以直接使用。',
        answer: true,
        explain:
          '正确。单文件组件的 <script setup> 中，顶层 import 的组件可直接在该组件模板使用，不需要再写 components 注册；顶层变量和函数也可被模板访问。defineProps/defineEmits 等是编译宏，应按其约束声明输入输出。',
        detail: {
          code: '<script setup>\nimport UserBadge from "./UserBadge.vue";\nconst props = defineProps({ name: String });\n</script>\n<template><UserBadge :name="props.name" /></template>',
          pitfalls:
            '这是该 SFC 的编译能力，不等于全局注册。普通 script、运行时动态组件引用和不同 Vue 版本的宏能力需要分别判断。',
          sources: [['Vue 官方文档', 'https://vuejs.org/api/sfc-script-setup.html']],
        },
      },
    ],
  },
  {
    id: 4,
    name: 'React 堡垒',
    desc: 'React 核心原理与生态',
    difficulty: 'medium',
    icon: '⚛️',
    questions: [
      {
        type: 'choice',
        q: 'React 的 Fiber 架构是什么？为什么需要它？',
        options: [
          'Fiber 就是一个新的 DOM 渲染方式',
          'Fiber 为协调工作建立可保存的单元；并发渲染可以在单元之间让出、恢复或放弃工作，但单个长同步函数仍会阻塞主线程',
          'Fiber 让 React 更慢了',
          'Fiber 和 Virtual DOM 无关',
        ],
        answer: 1,
        explain:
          'Fiber 是 React 协调工作的数据结构和执行单元，保存组件类型、状态、关联节点与更新工作。它让渲染工作能够被安排、暂停、继续或放弃，以便优先响应交互。并发渲染主要影响准备新 UI 的 render 阶段；React 在 commit 阶段将结果提交到 DOM，保持可见 UI 的一致性。',
        detail: {
          example:
            '搜索框输入更新保持紧急，昂贵结果列表作为非紧急更新；如果用户再次输入，旧的未完成列表渲染可以被放弃。组件渲染函数因此必须纯净，不能在 render 中扣款或发送业务提交。',
          pitfalls:
            'Fiber 不是多线程，也不会在一段用户 JS 循环的任意语句中间抢占。把 300ms 同步计算放进组件或 Transition 回调仍会阻塞；时间片长度是实现细节。',
          sources: [['React 官方文档', 'https://react.dev/blog/2022/03/29/react-v18']],
        },
        chain: 'frame-transition',
      },
      {
        type: 'choice',
        q: 'React 中 useState 的更新是同步还是异步？',
        options: [
          '调用 setter 后当前闭包变量立即变成新值',
          'setter 排队更新，当前渲染保留原快照；后续渲染读到新值，连续依赖旧结果时用函数式更新',
          'setter 返回 Promise，await 后即可读当前闭包中的新值',
          '所有异步边界内的更新一定合并成一次渲染',
        ],
        answer: 1,
        explain:
          'setState 调用会向 React 提交一次更新，但当前渲染闭包里的 state 值不会立刻改变；新值在后续渲染中可见。React 常将多次更新批处理，因此不能只用“同步/异步”概括，更不能把 setter 当成可 await 的 Promise。依赖前一次结果时传函数式更新，React 按队列顺序计算。',
        detail: {
          code: '// 当前 count 为 0\nsetCount(count + 1);\nsetCount(count + 1);\nsetCount(count + 1); // 三次都是替换为 1\n// 若业务要求连续加三次：\nsetCount(n => n + 1);\nsetCount(n => n + 1);\nsetCount(n => n + 1);',
          pitfalls:
            '批处理范围与 root API、调用路径有关；独立用户事件不会无条件合并。flushSync 可用于特殊的同步 DOM 集成，但有性能代价，调用后旧闭包变量也不会神奇变成新值。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/useState']],
        },
        chain: 'react',
      },
      {
        type: 'choice',
        q: 'useEffect、useLayoutEffect、useMemo、useCallback 的区别？',
        options: [
          '四者都用于在渲染后发送请求',
          'Effect 同步外部系统，LayoutEffect 在绘制前处理布局；Memo 缓存计算值，Callback 缓存函数身份',
          'useMemo 的回调适合提交订单等副作用',
          'useLayoutEffect 可把计算移到后台线程',
        ],
        answer: 1,
        explain:
          'useEffect 用于提交后同步外部系统，例如订阅与连接；useLayoutEffect 在 DOM 提交后、浏览器绘制前执行，适合必须在显示前完成的布局测量和修正。useMemo 在渲染中缓存计算结果，useCallback 缓存函数身份；后两者用于优化，不能承载业务副作用。',
        detail: {
          example:
            'tooltip 先测量高度再确定位置可用 useLayoutEffect，避免用户看到错误位置；监听 resize 用 useEffect 并返回清理；昂贵过滤用 useMemo；向 memo 子组件传稳定回调时可考虑 useCallback。',
          pitfalls:
            'useEffect 不承诺所有情况下都晚于绘制；交互路径可能影响时机。useLayoutEffect 及其同步更新会阻塞绘制，应控制工作量。缓存依赖不完整会形成旧闭包，也不该成为正确性所必需的唯一机制。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/useLayoutEffect']],
        },
        chain: 'frame-effect',
      },
      {
        type: 'choice',
        q: 'React 虚拟 DOM 和 Diff 算法原理？',
        options: [
          'React 没有虚拟 DOM',
          'React 根据元素类型、位置及同级 key 协调树；key 帮助识别列表项，Fiber 承载协调与调度工作',
          'diff 会跨层级比较',
          'key 不影响 diff',
        ],
        answer: 1,
        explain:
          'React 元素描述期望 UI，更新时 React 根据元素类型、树中位置及同级 key 协调旧树与新树，决定复用、更新或重建组件和 DOM。相同位置的相同类型通常保留状态；类型或 key 改变可能重置相应子树。列表 key 让身份随业务项移动，而不是随数组位置移动。',
        detail: {
          example:
            '<Editor key={documentId} /> 切到另一份文档时可以显式重建局部编辑态；列表重排时用文件 ID 保留各行身份。若每次用 Math.random() 生成 key，每次都可能卸载重建。',
          pitfalls:
            '协调算法是针对常见 UI 的启发式，不是寻找任意两棵树的全局最少编辑操作。JSX 可以编译为 createElement 或自动运行时函数，这不改变元素描述与实际 DOM 的区别。',
          sources: [['React 官方文档', 'https://react.dev/learn/preserving-and-resetting-state']],
        },
        chain: 'keys',
      },
      {
        type: 'choice',
        q: 'React 中受控组件和非受控组件的区别？',
        options: [
          '受控与非受控只影响组件文件的大小',
          '受控输入由 React 的 value/checked 及更新回调保持值；非受控由 DOM 保存当前值，必要时用 ref 读取',
          '把受控输入的 value 改成 undefined 是标准重置方式',
          '非受控表单不能设置初始默认值',
        ],
        answer: 1,
        explain:
          '受控输入由 React 提供当前 value/checked，事件处理把最新输入写回 state；DOM 展示持续受这个状态约束。非受控输入通过 defaultValue/defaultChecked 设置初始值，后续由 DOM 保存，可用 ref 或 FormData 在提交时读取。选择取决于是否需要实时校验、跨字段联动和外部重置。',
        detail: {
          code: 'function NameInput() {\n  const [name, setName] = useState("");\n  return <input value={name} onChange={e => setName(e.target.value)} />;\n}\n// 非受控：<input name="name" defaultValue="Alice" />\n// 提交时：new FormData(form).get("name")',
          pitfalls:
            '不要让 value 从 undefined 切换为字符串；异步回填还要保护用户草稿。文件输入等特殊控件需遵循浏览器约束，受控并不天然比非受控更优。',
          sources: [['React 官方文档', 'https://react.dev/reference/react-dom/components/input']],
        },
        chain: 'frame-input',
      },
      {
        type: 'choice',
        q: 'React 组件性能优化有哪些手段？',
        options: [
          'React 性能很好不需要优化',
          '1)React.memo 缓存组件 2)useMemo/useCallback 缓存值和函数 3)虚拟列表(react-window) 4)懒加载 React.lazy+Suspense 5)合理拆分 state 减少大范围重渲染',
          '优化只能改代码结构',
          'memo 没有用处',
        ],
        answer: 1,
        explain:
          '先用 Profiler 和浏览器性能记录定位慢在计算、渲染、提交、布局还是网络。减少不必要更新可缩小 state 所有权、细化 Store/Context 订阅；昂贵纯计算按依赖缓存；大量 DOM 用虚拟列表；较少访问的代码用 lazy 分割。React.memo 和 useMemo/useCallback 应服务于测到的具体成本。',
        detail: {
          example:
            '输入框每个字符都使整页重渲染，先把输入状态放到小组件；若长列表仍昂贵，再结合稳定 props、memo 和 deferred rendering。列表有十万条时，仅 memo 各行仍不如先限制可挂载节点量。',
          pitfalls:
            'memo 是优化提示，组件自身 state/context 变化仍会更新。新对象 props 会破坏浅比较；自定义比较器漏比较函数可能留下旧闭包，比较本身也有成本。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/memo']],
        },
        chain: 'frame-transition',
      },
      {
        type: 'choice',
        q: 'Redux 的工作原理？中间件是什么？',
        options: [
          'Redux 就是一个全局变量',
          '单一数据源(store)+action 描述事件+reducer 纯函数处理；dispatch(action)→reducer→new state→UI 更新；中间件在 dispatch 和 reducer 之间拦截处理异步(thunk/saga)',
          'Redux 不需要 reducer',
          'Redux 只能用于 React',
        ],
        answer: 1,
        explain:
          'Redux store 保存应用状态；dispatch 普通 action 后，reducer 根据旧状态和 action 纯计算新状态，store 通知订阅者，React-Redux 的选择器读取相关片段。中间件包装 dispatch，可在 reducer 之前后执行日志、异步调度等逻辑；thunk 使 dispatch 接受函数，由它取得 dispatch/getState 再派发普通 action。',
        detail: {
          code: 'const reducer = (state = {count: 0}, action) =>\n  action.type === "increment" ? {count: state.count + 1} : state;\nconst logger = store => next => action => {\n  const result = next(action); // 交给下一个中间件或 reducer\n  console.log(store.getState());\n  return result;\n};',
          pitfalls:
            'Reducer 不做请求、不改输入对象、不依赖随机时间。RTK 使用 Immer，切片 reducer 的“修改草稿”写法会生成不可变结果；不要据此在组件里直接改 store state。',
          sources: [
            ['Redux · 基础数据流', 'https://redux.js.org/tutorials/fundamentals/part-2-concepts-data-flow'],
          ],
        },
        chain: 'resume-redux',
      },
      {
        type: 'choice',
        q: 'React 18 有哪些新特性？',
        options: [
          '没什么新东西',
          '新 root API 下扩展自动批处理；提供 startTransition/useDeferredValue、流式 SSR、useId/useSyncExternalStore，并扩展 Suspense 支持',
          'React 18 不支持并发',
          '自动批处理只在事件函数中',
        ],
        answer: 1,
        explain:
          'React 18 引入 createRoot/hydrateRoot 新入口，扩大 Promise、定时器等来源的自动批处理，并提供 startTransition/useTransition、useDeferredValue 来表达非紧急 UI 更新。服务端渲染支持流式输出与 Suspense 的配合；useId 解决可访问性 ID 等跨服务端/客户端一致性问题，useSyncExternalStore 规范外部 Store 订阅。',
        detail: {
          example:
            '输入状态立即更新，把结果列表更新标记为 Transition；服务端可先流出页面壳和已完成区域，让较慢区域随后补齐。升级时先确认使用新 root，并在关键交互下验证行为。',
          pitfalls:
            '并发特性按使用路径启用；普通 useEffect fetch 不会自动被 Suspense 接管。useId 不适合给数据列表生成 key，useDeferredValue 也不等于请求防抖。',
          sources: [['React 官方文档', 'https://react.dev/blog/2022/03/29/react-v18']],
        },
        chain: 'frame-transition',
      },
      {
        type: 'truefalse',
        q: '所有 React JSX 构建配置都会把 JSX 转为 React.createElement 调用。',
        answer: false,
        explain:
          '错误。传统 JSX 转换可生成 React.createElement 调用；自动 JSX 运行时通常生成 jsx/jsxs 等调用，并由工具注入运行时导入。JSX 是构建期转换的语法，不由浏览器原生理解；两种转换最终都用于构造 React 元素描述。',
        detail: {
          example:
            '同一个 <h1>Hello</h1>，经典转换近似为 React.createElement("h1", null, "Hello")；自动运行时近似调用从 react/jsx-runtime 导入的 jsx。具体结果取决于构建配置。',
          sources: [
            [
              'React · 新 JSX Transform',
              'https://legacy.reactjs.org/blog/2020/09/22/introducing-the-new-jsx-transform.html',
            ],
          ],
        },
      },
      {
        type: 'truefalse',
        q: 'useEffect 省略依赖列表时，会在该组件每次提交后重新同步。',
        answer: true,
        explain:
          '正确。省略依赖列表时，Effect 在组件每次提交后重新执行；若上次返回清理函数，会先清理旧的同步关系再运行新 setup。传 [] 表示不依赖组件内响应式值，传 [a,b] 表示按 Object.is 比较依赖变化。Effect 只在客户端运行。',
        detail: {
          example:
            '开发环境的 StrictMode 可额外执行 setup→cleanup→setup 来发现清理不对称，因此 [] 也不能理解成所有环境里绝对只执行一次。被放弃且未提交的 render 不应触发这次 Effect。',
          pitfalls: '依赖列表应准确描述代码读取的响应式值；为减少次数而故意删依赖会留下旧数据。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/useEffect']],
        },
        chain: 'frame-effect',
      },
      {
        type: 'truefalse',
        q: 'React.memo 和 useMemo 的作用相同。',
        answer: false,
        explain:
          '错误。memo 包装组件，在 props 比较通过时可跳过部分由父组件引发的重新渲染；useMemo 在组件内部缓存一次纯计算的结果。它们可配合：父组件缓存派生数组，再传给 memo 列表，以免每次新数组引用让 props 比较失败。',
        detail: {
          example:
            'const visible = useMemo(() => filter(items, query), [items, query]); 将 visible 传给 memo(List)。若 items 或 query 真实变化，仍应重算并更新。',
          pitfalls:
            'memo 不阻止组件自身 state 或消费的 context 更新；useMemo 缓存可能被丢弃，不能当成持久化语义。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/useMemo']],
        },
      },
      {
        type: 'choice',
        q: 'React 中 useRef 的用途？和 useState 的区别？',
        options: [
          'useRef 就是 useState 的别名',
          'useRef 创建可变引用对象{current:T}修改不触发重渲染适合存储 DOM 引用/定时器 ID/不参与渲染的数据；useState 修改触发重渲染参与 UI 渲染；useRef 在整个生命周期保持同一对象',
          'useRef 修改会触发重渲染',
          'useRef 不能用于 DOM',
        ],
        answer: 1,
        explain:
          'useRef 返回稳定的引用容器，修改 current 不会通知 React 重新渲染，适合 DOM 节点、计时器句柄等不直接驱动画面的数据。useState 的值属于渲染状态，setter 安排更新，下一次渲染看到新快照。需要显示在界面上的计数应使用 state，而不能只改 ref。',
        detail: {
          code: 'function Search() {\n  const inputRef = useRef(null);\n  return <>\n    <input ref={inputRef} />\n    <button onClick={() => inputRef.current?.focus()}>聚焦</button>\n  </>;\n}',
          pitfalls:
            '渲染期间随意读写 ref 可能破坏纯渲染假设。存了 interval ID 不代表会自动清理，仍需在 Effect cleanup 清除。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/useRef']],
        },
      },
      {
        type: 'choice',
        q: 'React 的 Context 是什么？什么时候用？有什么性能问题？',
        options: [
          'Context 能让所有消费者自动按字段订阅',
          'Context 向后代提供共享值，Provider 值按 Object.is 变化会通知消费者；可拆分上下文并稳定未改变的值',
          '给消费者加 memo 就一定阻止 Context 更新',
          'useMemo 能保证 Provider 的任何数据变化都不触发消费者渲染',
        ],
        answer: 1,
        explain:
          'Context 让后代读取最近 Provider 提供的值，减少逐层传 props，适合主题、语言或作用域内的身份配置。Provider 的 value 按 Object.is 比较发生变化时，消费该 Context 的组件会重新读取，memo 不能屏蔽真正的 Context 更新。Context 是传递/订阅机制，状态仍由 state、reducer 或外部 Store 管理。',
        detail: {
          code: 'const ThemeContext = createContext("light");\nfunction Button() {\n  const theme = useContext(ThemeContext);\n  return <button className={theme}>确认</button>;\n}\n// <ThemeContext.Provider value={theme}><Button /></ThemeContext.Provider>',
          example:
            'value={{user, login}} 每次生成新对象，会在 user 未变时也触发订阅更新。可稳定函数和值对象，按变化频率拆 Context；若字段确实频繁变化，可选择更细粒度的 Store 订阅。',
          pitfalls: 'useMemo 只能减少不必要的身份变化，无法让真正变化的全量 Context 自动变成字段级订阅。',
          sources: [['React 官方文档', 'https://react.dev/reference/react/useContext']],
        },
      },
      {
        type: 'choice',
        q: 'React 的错误边界(Error Boundary)是什么？怎么用？',
        options: [
          '错误边界就是 try/catch',
          '用类组件错误边界处理后代渲染错误，getDerivedStateFromError 提供备用 UI，componentDidCatch 记录信息；普通事件或异步回调错误需按调用路径处理',
          '错误边界能捕获 setTimeout 中的错误',
          '函数组件可以直接实现错误边界',
        ],
        answer: 1,
        explain:
          '错误边界在组件树中接住后代的渲染等 React 管理阶段错误，显示局部备用 UI 并记录诊断信息。类组件可用 static getDerivedStateFromError 更新备用状态，componentDidCatch 记录错误与组件栈，再把可能失败的区域包在该边界下。',
        detail: {
          code: 'class ErrorBoundary extends React.Component {\n  state = { failed: false };\n  static getDerivedStateFromError() { return { failed: true }; }\n  componentDidCatch(error, info) { report(error, info.componentStack); }\n  render() {\n    return this.state.failed ? <p>该区域加载失败</p> : this.props.children;\n  }\n}\n// <ErrorBoundary><ReportTable /></ErrorBoundary>',
          pitfalls:
            '普通 onClick、定时器等回调中的异常在对应调用链处理；边界自己的错误由更上层接住。新版本特定 Transition Action 另有处理规则，回答应说明调用路径。按可独立恢复的区域划分边界，重试展示不能自动重发未知结果的业务写入。',
          sources: [
            [
              'React 官方文档',
              'https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary',
            ],
          ],
        },
        chain: 'frame-boundary',
      },
      {
        type: 'truefalse',
        q: 'React 18 的 useTransition 可以将某个状态更新标记为低优先级。',
        answer: true,
        explain:
          '正确。在 React 18 中，startTransition 将同步回调中安排的状态更新标记为非紧急 Transition，React 可在需要时让紧急输入更新优先，并放弃旧的未完成渲染。isPending 用于提示该 Transition 尚未完成。它用于调度 UI 更新，不会把普通同步计算变成后台任务。',
        detail: {
          code: 'const [isPending, startTransition] = useTransition();\nfunction onChange(event) {\n  const value = event.target.value;\n  setText(value); // 输入框状态保持紧急\n  startTransition(() => setQuery(value));\n}',
          pitfalls:
            '受控输入本身不能靠 Transition 更新以保持即时反馈。React 18 的异步 await 边界后更新需要重新标记；后续 React 版本的 Actions 能力应另按版本解释。',
          sources: [['React 官方文档', 'https://react.dev/blog/2022/03/29/react-v18']],
        },
        chain: 'frame-transition',
      },
    ],
  },
  {
    id: 5,
    name: 'Node.js 与工程化之塔',
    desc: 'Node.js+构建工具+CI/CD',
    difficulty: 'hard',
    icon: '🏗️',
    questions: [
      {
        type: 'choice',
        q: 'Node.js 的事件循环和浏览器的有什么区别？',
        options: [
          '完全一样',
          'Node 的 libuv 循环处理定时器、I/O 与 check 等阶段，并有 nextTick；浏览器还协调渲染，具体顺序需结合回调检查点、模块格式和运行时版本',
          'Node 没有事件循环',
          'Node 的事件循环和浏览器完全相同',
        ],
        answer: 1,
        explain:
          '浏览器事件循环要协调任务、微任务与渲染机会；Node 基于 libuv 处理 timers、poll、check、close 等阶段，并提供 process.nextTick。微任务与 nextTick 在相应回调检查点处理，不能说只在阶段切换时清空；顶层 CJS 与 ESM 的执行上下文还会影响可见顺序。',
        detail: {
          principle:
            '定时器阈值不是精确执行时刻；setImmediate 通常在 check 阶段运行。Node 20 所用 libuv 1.45 起 timers 的调度位置有变化，分析题目要标明版本及发生在文件顶层还是 I/O 回调内。',
          example:
            '在常见现代 Node 的 CJS 顶层依次登记 Promise.then、queueMicrotask、nextTick，通常 nextTick 先于前两者；在 ESM 顶层，模块求值处于微任务过程，输出可不同。不要用一条固定口诀覆盖所有嵌套情况。',
          pitfalls:
            '递归补入微任务或 nextTick 可能让 I/O 迟迟得不到机会。让出机会与把计算放进 Promise 是两回事。',
          followups: [],
          sources: [
            [
              'Node.js · Event Loop',
              'https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick',
            ],
          ],
        },
        chain: 'runtime-microtasks',
      },
      {
        type: 'choice',
        q: 'Node.js 中 Stream 有哪些类型？应用场景？',
        options: [
          'Stream 只有一种类型',
          'Readable、Writable、Duplex、Transform；用于文件、网络、压缩等分块处理，通过背压、错误传播与取消控制资源',
          'Stream 不能用于网络请求',
          'Stream 会把整个文件加载到内存',
        ],
        answer: 1,
        explain:
          'Readable 提供可读取的数据，Writable 接收写入，Duplex 两个方向都具备，Transform 在读写之间转换数据。流适合大文件、HTTP 消息和压缩等逐块处理，避免先把全部数据装入内存。关键不仅是分块，还要把背压、错误和取消传到整条链。',
        detail: {
          principle:
            'Writable.write 返回 false 表示应暂停继续生产，待 drain 后恢复。pipe 能传递背压，但完整管线通常用 pipeline 统一处理结束与错误；对 HTTP 响应则要考虑错误发生后是否还能返回状态码。',
          example:
            '下面是独立文件压缩示例。输入或输出失败时，pipeline 拒绝并清理相关流；不要把 Buffer 全部收集起来再压缩，否则失去流式内存收益。',
          pitfalls:
            'Transform 的输出大小可能远大于输入，仍要限制总体资源。使用流不自动保证内存有界，业务缓存也可能无限增长。',
          followups: [],
          sources: [['Node.js · Stream', 'https://nodejs.org/api/stream.html']],
          code: "const {createReadStream, createWriteStream} = require('node:fs');\nconst {createGzip} = require('node:zlib');\nconst {pipeline} = require('node:stream/promises');\nasync function compress(input, output) {\n  await pipeline(createReadStream(input), createGzip(), createWriteStream(output));\n}",
        },
        chain: 'system-export',
      },
      {
        type: 'choice',
        q: '什么是中间件？Express 中间件的执行机制？',
        options: [
          '中间件就是路由',
          '按匹配和注册顺序调用中间件，它可结束响应或通过 next 交给后续处理；错误中间件有四个参数，不响应也不 next 会让请求悬住',
          '中间件不能有参数',
          '中间件执行顺序是随机的',
        ],
        answer: 1,
        explain:
          'Express 中间件是在请求处理链中运行的函数，通常接收 req、res、next，并按匹配和注册顺序执行。它可读取或补充请求上下文、发送响应结束处理，或调用 next 把控制权交给后续处理；既不结束响应又不调用 next，会让请求悬住。',
        detail: {
          principle:
            '错误中间件具有四个参数 err、req、res、next，通常放在业务路由之后。同步抛错可进入错误链；Express 5 会处理返回 Promise 的拒绝，Express 4 常需显式 catch(next) 或包装器。next() 不会自动停止当前函数后续代码，因此终止分支通常 return。',
          example:
            '推荐先关联号和日志，再解析、身份认证、资源授权、业务处理和统一错误转义。错误响应对外给稳定业务码，内部日志记录关联号，避免向浏览器泄漏堆栈。',
          pitfalls: '中间件顺序是功能契约：在 body 解析前读取 JSON 字段、在认证前访问用户权限都可能失败。',
          followups: [],
          sources: [['Express · 错误处理', 'https://expressjs.com/en/guide/error-handling.html']],
          code: "function requireUser(req, res, next) {\n  if (!req.user) return res.status(401).json({code: 'LOGIN_REQUIRED'});\n  next();\n}\nfunction errorHandler(err, req, res, next) {\n  if (res.headersSent) return next(err);\n  res.status(500).json({code: 'INTERNAL', requestId: req.id});\n}",
        },
      },
      {
        type: 'choice',
        q: 'CommonJS 和 ES Module 的区别？',
        options: [
          'CommonJS 与 ESM 只是文件后缀不同',
          'CommonJS 在运行时通过 require 获取导出值；ESM 有静态模块结构和实时绑定，加载与互操作要结合环境',
          'CommonJS 导出的对象被修改时，所有调用方都永远看不到变化',
          'ESM 导入者可以任意重新赋值导出方的变量',
        ],
        answer: 1,
        explain:
          'CommonJS 用 require 和 module.exports，在运行过程中加载并缓存模块结果；ESM 用 import/export 声明模块关系，静态结构便于链接与分析，并提供导出绑定的实时视图。不能简单说 CommonJS 是“值拷贝”：若导出对象，使用者可以观察对同一对象的属性修改。',
        detail: {
          principle:
            'CJS 使用者拿到的是当时 module.exports 指向的值；后来整体替换 module.exports，不会自动更新旧使用者持有的引用。ESM 的命名导入是只读导入绑定，能观察导出端对该绑定的更新。动态 import、顶层 await 和 CJS/ESM 互操作还受运行时版本约束。',
          example:
            'CJS 导出 const state={n:0}，调用方 require 后，导出模块执行 state.n++，调用方能看到 n 改变；这反驳了“所有修改都不影响外部”的说法。若调用方先解构出 n，则得到的数字不会自动变。',
          pitfalls:
            'tree shaking 的效果还取决于副作用、构建工具和代码形态。不要把“ESM 静态”误解成所有模块代码都在编译时执行。',
          followups: [],
          sources: [['Node.js · CommonJS', 'https://nodejs.org/api/modules.html']],
        },
        chain: 'lang-esm-cycle',
      },
      {
        type: 'choice',
        q: 'Vite 在一些项目中的开发启动和热更新为什么更快？如何与 webpack 公平比较？',
        options: [
          'Vite 永远不需要解析或转换源码',
          '按需模块处理与较小热更新范围可减少开发时前置工作，实际速度还受版本、插件、依赖和缓存影响',
          '只要工具用 Rust 编写，就能保证所有项目更快',
          '开发服务启动时间就等于页面可交互时间',
        ],
        answer: 1,
        explain:
          'Vite 的典型开发体验收益来自按需处理源码、原生 ESM 的模块边界、依赖预处理以及较小范围的 HMR，而传统先打完整开发包的方式可能做更多前置工作。但“Vite 永远比 webpack 快”没有统一结论，要分别比较冷启动、首屏、热更新与生产构建，并固定项目和版本。',
        detail: {
          principle:
            'Vite 工具链会随大版本变化，不能把 esbuild 加 Rollup 当成永恒架构；当前文档已经描述了向 Rust 工具链的演进。webpack 也有持久缓存、懒编译等优化，差异取决于插件、依赖图、转换成本与缓存状态。',
          example:
            '比较同一个大项目时，记录禁用缓存的启动时间、首次打开含复杂依赖的页面耗时、改动叶子模块和公共模块的 HMR 延迟，再比较生产产物。只看终端“server ready”不能代表用户页面已经可用。',
          pitfalls: '题目应改成“为什么在某些开发场景启动/更新更快”，不应灌输固定倍数或固定实现语言。',
          followups: [],
          sources: [['Vite · Why Vite', 'https://vite.dev/guide/why']],
        },
      },
      {
        type: 'choice',
        q: 'Webpack 的 Loader 和 Plugin 的区别？',
        options: [
          'Loader 和 Plugin 没区别',
          'Loader 主要转换模块资源；Plugin 通过构建生命周期钩子介入模块图、优化和资源输出等流程，普通 loader 转换链通常从右向左执行',
          'Loader 的普通转换阶段永远按从左到右的顺序执行',
          'Plugin 不允许访问构建生命周期或编译上下文',
        ],
        answer: 1,
        explain:
          'Loader 负责模块资源的转换，例如把 TypeScript、CSS 或其他输入变成构建系统能处理的模块内容；Plugin 通过 Compiler/Compilation 等生命周期钩子参与更广泛流程，如生成资源、修改优化或处理产物。两者关注层次不同，不应只按“一个改 JS、一个改 HTML”分类。',
        detail: {
          principle:
            '普通 loader 链的转换通常从右到左执行；pitch 阶段另有从左到右及短路规则。Plugin 的 apply 方法注册钩子，在相应阶段获得编译上下文；可以检查整个模块图或输出资源。',
          example:
            '处理 .ts 文件可用转换 loader；生成 HTML 并插入正确哈希资源引用可用插件。新增能力时先确认只需转换一个资源，还是需要影响整体构建。',
          pitfalls:
            'DefinePlugin 通常在构建中替换代码中的常量表达式，它不是把运行时服务器环境自动安全地注入浏览器。',
          followups: [],
          sources: [['webpack · Concepts', 'https://webpack.js.org/concepts/']],
        },
      },
      {
        type: 'choice',
        q: 'JWT 的原理？和 Session 有什么区别？',
        options: [
          'JWT 就是加密的密码',
          '常见签名 JWT 编码声明并用签名保护完整性，验证后仍要检查有效期、受众等约束；传统 Session 通常用不透明标识查询服务端状态，撤销和权限变更都需设计',
          'JWT 的 Base64URL 编码会隐藏用户敏感信息',
          'JWT 和 Session 完全一样',
        ],
        answer: 1,
        explain:
          '常见签名 JWT 使用 JWS 紧凑形式：编码后的头、载荷和签名以点分隔。验证方按可信算法与密钥验签，并检查发行方、受众、有效期等约束后才使用声明。传统 Session 通常以不透明标识查询服务端会话状态；JWT 可减少每次查会话，但撤销、续期和权限变化仍需设计。',
        detail: {
          principle:
            'Base64URL 编码不提供保密，签名保护完整性而非隐藏载荷；JWT 也存在加密形式，不能把“三段”当作所有 JWT 的唯一形式。不要相信令牌自报的算法或未验证的载荷，密钥轮换要明确可信来源。',
          example:
            '若员工被撤权但访问令牌尚未过期，可采用短有效期配合服务端权限版本或撤销状态。是否查库取决于实时撤销要求，不能仅说“JWT 无状态所以无需服务器状态”。',
          pitfalls:
            'Cookie 和 JWT 并非互斥选项，JWT 也可放 Cookie，此时仍需考虑 CSRF；放在可读存储则要考虑 XSS 盗取风险。',
          followups: [],
          sources: [['RFC 7519 · JWT', 'https://www.rfc-editor.org/rfc/rfc7519.html']],
        },
        chain: 'integration-sso',
      },
      {
        type: 'choice',
        q: '前端性能优化有哪些手段？全链路说。',
        options: [
          '性能优化就是压缩图片',
          '先用真实用户指标和链路测量定位，再分别优化网络等待、关键资源、JS 执行与渲染，并用同条件对照和上线监控验证结果',
          '性能优化只在服务器端',
          '压缩 JS 就够了',
        ],
        answer: 1,
        explain:
          '先按用户目标定位瓶颈，再沿链路优化：网络侧缩短连接与首字节等待、设置正确缓存和压缩；资源侧减少关键资源体积与发现延迟；执行侧减少解析、长任务和重复计算；渲染侧控制 DOM 规模、布局与绘制成本；交付侧持续监控真实设备的首屏和交互指标。',
        detail: {
          principle:
            '使用 LCP 看主要内容呈现、INP 看交互响应、CLS 看布局稳定，同时记录业务成功率。实验室录制用于解释原因，真实用户数据用于判断受影响范围。优化必须有同类设备、网络、数据规模和版本的前后对照。',
          example:
            '首屏大图晚发现时，可优化资源发现顺序、尺寸和加载优先级；列表点击卡顿若来自 200ms 同步计算，应减少工作或分段/Worker，而不是只换图片格式。',
          pitfalls: '懒加载关键首屏图、滥用 preload、增加无用图层都可能恶化结果。技术手段应由证据选择。',
          followups: [],
          sources: [['web.dev · Web Vitals', 'https://web.dev/articles/vitals']],
        },
        chain: 'measure',
      },
      {
        type: 'truefalse',
        q: 'Node.js 是单线程的意味着不能处理并发请求。',
        answer: false,
        explain:
          '错误。一个 Node 事件循环中的 JavaScript 通常串行执行，但可同时等待多个非阻塞 I/O；就绪回调再轮流运行，因此能服务多个请求。普通网络 I/O 常由系统异步机制支持，部分文件、名称解析和加密工作使用 libuv 池，不是所有 I/O 都交给线程池。',
        detail: {
          principle:
            '并发描述多个任务在同一时间区间内推进；并行描述真正同时执行。CPU 密集的同步 JS 会占住事件循环，影响其他请求，需要限制工作量并考虑 Worker 或独立进程。',
          example:
            '等待数据库时还可接收其他请求；但在请求中同步做大 JSON 运算，其他请求即使 I/O 已就绪，也要等当前 JS 让出执行。',
          pitfalls: '增加并发不等于无限容量，下游连接池、排队内存和截止时间都要受控。',
          followups: [],
          sources: [
            [
              'Node.js · Event Loop',
              'https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick',
            ],
          ],
        },
        chain: 'node',
      },
      {
        type: 'truefalse',
        q: 'ESM 的静态结构有利于 tree shaking；能否删除代码还需要分析使用关系和模块副作用。',
        answer: true,
        explain:
          'ESM 的静态导入导出结构是常见 tree shaking 的重要依据，但删除未使用导出仍需保留模块必要副作用。CommonJS 的优化能力取决于工具与代码形态，不能一概断言绝不支持。sideEffects 声明是包作者给构建器的契约，需要与真实代码一致。',
        detail: {
          principle:
            '导出未使用与整个模块可跳过是两个判断。模块可能注册全局能力或加载 CSS，即使某个 JS 导出未用，也不能自动删除这些行为。',
          example:
            '组件包若错误声明所有文件 sideEffects:false，按钮 JS 被保留但样式导入可能被裁掉。应明确保留 CSS 等副作用文件，并在生产构建中验证样式。',
          pitfalls: '不要用开发环境正常来证明生产裁剪安全；优化通常在构建阶段才真正生效。',
          followups: [],
          sources: [['webpack · Concepts', 'https://webpack.js.org/concepts/']],
        },
        chain: 'platform-side-effects',
      },
      {
        type: 'truefalse',
        q: 'PM2 的 cluster 模式可以利用多核 CPU。',
        answer: true,
        explain:
          '正确。PM2 cluster 模式可运行多个 Node 工作进程，利用多个 CPU 核心承接服务。常见启动示例是 pm2 start app.js -i 4；实例数应按 CPU 配额、内存、连接池和业务负载确定，不能只看到主机核数就无条件开满。',
        detail: {
          principle:
            '每个进程有自己的堆、模块缓存和内存变量。会话、任务状态或锁若仅存在某个进程内，请求被分配到其他进程时可能丢失上下文。',
          example:
            '从一个实例扩为四个时，验证登录态、上传进度、定时任务是否重复，以及滚动重启期间的请求完成情况。',
          pitfalls: '进程管理器不会自动把所有应用状态共享，也不会替应用实现数据库幂等和优雅停机。',
          followups: [],
          sources: [['PM2 · Cluster Mode', 'https://pm2.keymetrics.io/docs/usage/cluster-mode/']],
        },
        chain: 'rdata-pm2-state',
      },
      {
        type: 'choice',
        q: 'Node.js 中的内存管理和 V8 的堆内存限制？如何处理大内存？',
        options: [
          'Node.js 没有内存限制',
          '读取实际 V8 堆上限并区分 RSS、heapUsed、external 等指标；用流式处理、背压和有界并发控制峰值，按堆内或原生增长来源定位',
          'Node.js 可以无限制使用内存',
          '把 --max-old-space-size 调大就能修复所有内存泄漏',
        ],
        answer: 1,
        explain:
          'Node 内存不能只看 JavaScript 堆。process.memoryUsage 包括 RSS、heapUsed/heapTotal、external、arrayBuffers 等不同口径；V8 实际堆上限可以读 heap_size_limit，受版本、资源与参数影响。大数据优先采用流式处理、背压、有界并发与及时释放资源，再按增长来源诊断。',
        detail: {
          principle:
            'arrayBuffers 已包含在 external 中，不能简单全部相加。--max-old-space-size 主要调整老生代预算，不限制 Buffer、线程栈、原生库及整个容器。容器还可能包含多个进程，应看总内存。',
          example:
            'GC 后 heapUsed 稳定但 RSS 持续增大，继续查 Buffer 引用、原生分配或分配器碎片；若同一页面切换导致保留对象不断增加，可对比堆快照和保留路径。',
          pitfalls: '把堆调大只是改变容量，不能修复泄漏；应在相同负载下确认多轮运行后资源是否进入稳定区间。',
          followups: [],
          sources: [
            ['Node.js · process.memoryUsage', 'https://nodejs.org/api/process.html#processmemoryusage'],
          ],
          code: "const v8 = require('node:v8');\nconsole.log(process.memoryUsage());\nconsole.log({heapLimitBytes: v8.getHeapStatistics().heap_size_limit});",
        },
        chain: 'runtime-memory-budget',
      },
      {
        type: 'choice',
        q: 'Express 和 Koa 的区别？洋葱模型是什么？',
        options: [
          'Express 和 Koa 完全一样',
          'Express 的 next 传递控制权；Koa 的 await next 等待下游完成，可形成进入时由外到内、退出时由内到外的异步洋葱模型',
          'Express 的 next() 总会返回代表全部下游异步工作完成的 Promise',
          'Koa 不支持 async/await',
        ],
        answer: 1,
        explain:
          'Express 通过 req/res/next 组成按注册顺序匹配的处理链；Koa 以 ctx 和可等待的 next 组合异步中间件。Koa 在 await next() 前执行进入逻辑，等待下游结束后再执行退出逻辑，形成由外到内再由内到外的洋葱顺序。',
        detail: {
          principle:
            '例如两层 Koa 中间件的输出是 A前、B前、业务、B后、A后，外层因此可用 try/finally 统计整体耗时或统一捕获下游错误。Express 调用 next() 传递控制，但 next 本身不是代表下游异步完成的 Promise，不能照搬 await next 的模型。',
          example:
            '在 Koa 外层记录时间，await next 后读取最终状态码与耗时。若漏写 await，外层后置逻辑可能提前运行；若忘记调用 next，下游不会执行。',
          pitfalls:
            'Express 5 对 Promise 错误有增强，但仍不等同于 Koa 的组合模型。路由、静态服务和中间件生态应按具体版本比较。',
          followups: [],
          sources: [['Koa · Middleware', 'https://koajs.com/']],
          code: 'async function timing(ctx, next) {\n  const start = performance.now();\n  try { await next(); }\n  finally { console.log(ctx.status, performance.now() - start); }\n}',
        },
      },
      {
        type: 'choice',
        q: 'Node.js 中的 Cluster 和 worker_threads 的区别？什么时候用哪个？',
        options: [
          '两者完全一样',
          'Cluster 使用独立进程承载多实例服务；worker_threads 在同进程内并行执行 JS，适合受控的 CPU 任务池，并需要明确数据传递与故障边界',
          'Worker 自动共享所有 JavaScript 对象',
          'Worker 的 JavaScript 始终只能在主线程运行',
        ],
        answer: 1,
        explain:
          'Cluster 用多个独立 Node 进程承载服务，常用于服务多实例；worker_threads 在同一进程内以线程并行执行 JavaScript，适合把 CPU 密集工作移出主事件循环。两者都应通过容量受控的池管理，选择时比较启动成本、数据传递和故障隔离要求。',
        detail: {
          principle:
            'Worker 普通对象通常经结构化克隆传递，ArrayBuffer 可转移，SharedArrayBuffer 可显式共享并需要同步。每个 Worker 的 JS 执行环境与普通对象堆独立，但它们仍处于同一进程，原生进程级崩溃和总内存风险不能完全隔离。',
          example:
            '短小频繁计算若每次创建 Worker，启动和克隆成本可能超过计算本身；复用固定池并比较完整请求的尾延迟。要求强故障隔离的原生转换任务可考虑独立进程或服务。',
          pitfalls:
            '“不同 V8 isolate 所以不是真线程”是错误说法。Worker 确实可以并行执行，不会自动共享全部 JS 对象。',
          followups: [],
          sources: [['Node.js · Worker threads', 'https://nodejs.org/api/worker_threads.html']],
        },
        chain: 'runtime-isolation',
      },
      {
        type: 'truefalse',
        q: '常规 Buffer 不能像普通数组一样通过 push 原地扩容；拼接通常会创建新的 Buffer。',
        answer: true,
        explain:
          '对常规创建的 Buffer，可以把它理解为固定长度的字节序列，不能像普通数组一样 push 扩容。需要更大空间时分配新 Buffer 或使用 Buffer.concat。Buffer.from 用字符串时还要明确编码；alloc 会初始化字节，allocUnsafe 在使用前必须确保所需区域已被正确写入。',
        detail: {
          principle:
            'Buffer 是 Uint8Array 的子类。subarray 通常与原 Buffer 共享底层内存，修改视图可能影响原数据；Buffer.from(existingBuffer) 可用于复制。UTF-8 一个字符可能跨多个字节，切块解码要保留不完整序列。',
          example:
            '截取网络包的一部分用于异步处理时，先确认希望共享还是复制，否则上游复用或修改原缓冲可能改变后续看到的值。',
          pitfalls: 'Buffer 数据计入进程内存，不是“堆外所以不占内存”。二进制长度也不等于字符串字符数。',
          followups: [],
          sources: [['Node.js · Buffer', 'https://nodejs.org/api/buffer.html']],
        },
      },
    ],
  },
  {
    id: 6,
    name: 'Node.js 迁移洞',
    desc: 'PHP→Node.js 接口迁移实战',
    difficulty: 'medium',
    icon: '🔀',
    questions: [
      {
        type: 'choice',
        q: '迁移 19 个 PHP 接口到 Node.js/TS 时分层架构怎么设计？',
        options: [
          '只分 Controller 和数据库查询两层',
          'Controller/AO/Util/Middleware 分层：Controller 参数校验和响应封装 AO 业务逻辑调用下游 RPC Util 工具函数 Middleware 鉴权和错误码统一处理',
          '所有逻辑写在路由里',
          '按 MVC 分 Model 负责一切',
        ],
        answer: 1,
        explain:
          '按请求职责分层：Middleware 先做身份、请求关联号与统一错误出口；Controller 校验输入并构造 DTO；AO 编排业务规则、授权与下游调用；RPC 适配层处理协议字段和错误码；Util 放不依赖请求上下文的纯转换函数。返回时把下游结果转为对外 DTO，日志保留关联号。分层的目的，是让业务规则、协议细节和 HTTP 边界能分别替换和测试。',
        detail: {
          example:
            '以“查询分账明细”为例：Controller 校验商户号和单号格式，AO 校验操作者可查看该商户，再调用 RPC 适配器；适配器把 Long 单号无损转换为字符串并归一错误码，Controller 输出约定响应。这里是职责示例，内部框架的具体 API 按实际代码说明。',
          pitfalls:
            'Middleware 中做登录认证不等于资源授权。能登录的人未必能访问请求指定商户；AO 仍需检查当前身份、资源与动作的关系。不要把所有请求有关逻辑塞进 Util。',
          followups: [
            [
              '如何测每一层？',
              'Controller 测缺字段和类型错误；AO 注入假的下游测允许、拒绝及超时；适配器用真实形态的 protobuf 样例测类型转换；最后补一条贯通身份、权限和响应的接口测试。',
            ],
          ],
        },
      },
      {
        type: 'choice',
        q: '迁移过程中 protobuf/Long/Buffer 类型转换遇到什么坑？',
        options: [
          '所有 64 位整数都可以先转 Number 再序列化',
          '标识符保留无损表示，Buffer 明确编码，protobuf 字段按 schema 转换并验证边界样例',
          '只把 PHP array 改成 TS object 就能保持所有语义',
          'BigInt 可以默认无配置地被 JSON.stringify 序列化',
        ],
        answer: 1,
        explain:
          '先区分三种转换问题。64 位整数超出 Number 的安全范围时，第一次转成 Number 就可能损失精度；标识符应从 Long 直接转十进制字符串。BigInt 可用于整数运算，但默认 JSON.stringify 不能直接序列化，要在 DTO 边界转字符串。Buffer 表示字节，hex、base64、UTF-8 是不同解释方式；protobuf 的缺省值、枚举、可选字段和 oneof 也必须按 schema 对齐。',
        detail: {
          example:
            '9007199254740992 与 9007199254740993 是两个不同订单号；把它们先转 Number 后可能变成同一个值，再 String(number) 也无法恢复。Buffer.from("你好", "utf8").toString("base64") 得到的是编码文本，不是原正文。',
          code: 'const dto = { orderId: rpcOrderId.toString() }; // 从 Long 直接输出字符串\nconst amount = 9007199254740993n;\nconst json = JSON.stringify({ amount: amount.toString() });\nconst bytes = Buffer.from("你好", "utf8");\nconst restored = Buffer.from(bytes.toString("base64"), "base64").toString("utf8");',
          pitfalls:
            '金额还需明确币种、最小单位、舍入及上限，不能照搬标识符的字符串处理去做加法。日志采集器自身也可能把长数字解析成 Number。',
          sources: [
            [
              'MDN · BigInt 与 JSON',
              'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt',
            ],
          ],
          followups: [
            [
              '回归用例如何选？',
              '覆盖最大安全整数两侧、相邻大整数、零/缺失/null、未知枚举、中文与二进制零字节；逐边界对比值或字节，找到第一次发生变化的位置。',
            ],
          ],
        },
        chain: 'long',
      },
      {
        type: 'choice',
        q: '6 周完成 9000+ 行迁移零事故上线做了哪些保障？',
        options: [
          '改完直接上线出问题再修',
          '接口逐一对比 PHP 和 Node 输入输出一致性、灰度切流先小流量验证、补齐监控告警、准备回滚方案、细粒度权限管控和自动化部署',
          '只做了单元测试就够了',
          '让 QA 全手动回归',
        ],
        answer: 1,
        explain:
          '保障应沿“兼容验证—发布控制—业务观测—恢复”形成闭环。先按 19 个接口列调用方、读写属性、异常码和边界样例；迁移时比较旧新响应及业务副作用。只读接口可在满足条件时影子比对，有副作用的写接口用隔离数据验证且保持单一执行方。分批切流时设置停止条件，发布后按同一业务单号核对完成结果，回滚同时检查新旧数据兼容。',
        detail: {
          example:
            '可这样说明个人工作：“我负责的接口先固定 Long、空值、错误码和权限拒绝样例；上线前验证原单号重试不会重复执行，上线后按接口看业务完成率和尾延迟。团队的 9000+ 行是迁移规模，我会再说明自己负责哪些接口。”只有确实完成的动作才用过去时陈述。',
          pitfalls:
            '“HTTP 200 没下降”不能证明兼容：空列表变多、金额字段被截断、权限错误映射错都可能不产生 HTTP 错误。零事故需要事故定义、观察窗口和告警范围。',
          followups: [
            [
              '新版错误率更低但空列表增加，放量吗？',
              '暂停扩大，按同一身份和数据版本比对列表基数、权限过滤与字段转换，定位新增空列表的原因，再以业务契约决定放量。',
            ],
          ],
        },
        chain: 'parity',
      },
      {
        type: 'text',
        q: '为什么不直接重写而要迁移？',
        answer: '迁移',
        explain:
          '迁移和重写都可能改动代码，区别在于首要目标和变更范围。本题的迁移目标是保留已验证的外部业务行为，同时替换 PHP 技术栈并补齐类型、监控与交付能力；先锁定接口契约，可按接口逐批验证与切流。全面业务重写会同时改变技术和业务规则，兼容面、数据迁移和回归范围更大。若旧模型已经不能满足需求，重设计仍可能合理，需把收益和迁移成本单独评估。',
        detail: {
          example:
            '旧接口用 null 表示无权限、[] 表示没有记录。迁移时不能为了“返回更整齐”把它们统一为空数组，否则前端原有权限分支失效。可先兼容旧协议，再通过新版本调整契约。',
          followups: [
            [
              '迁移过程中能重构吗？',
              '可以重构内部层次和重复代码，但用输入输出、授权与副作用样例守住外部语义。业务行为修改独立记录、验证与发布。',
            ],
          ],
        },
        chain: 'parity',
      },
    ],
  },
  {
    id: 7,
    name: '文件上传峡谷',
    desc: '大文件分片上传全链路',
    difficulty: 'medium',
    icon: '📦',
    questions: [
      {
        type: 'choice',
        q: 'Web Worker 在分片上传中的作用？为什么不在主线程算 Hash？',
        options: [
          '创建 Worker 后浏览器自动完成分片上传和所有重试',
          '将摘要计算移出主线程，并明确分块、传输成本与服务端去重授权条件',
          'Worker 保证计算耗时更短且不占用额外内存',
          '相同文件名已经足以安全秒传，无需内容校验',
        ],
        answer: 1,
        explain:
          '本题把文件摘要计算交给 Web Worker，是为了把耗时的同步计算移出页面主线程，让输入、进度显示与绘制有机会继续执行。主线程提供文件分片，Worker 计算并回报摘要；这不会自动减少总计算量。摘要可辅助内容去重与续传，但“服务器存在同一 Hash”并不直接等于当前用户有权获得该文件，服务端还需核对内容、会话和授权。',
        detail: {
          principle:
            '传输文件时还要控制内存：分块读 Blob.slice，使用支持增量的摘要实现或明确每片/整体摘要协议。Transferable ArrayBuffer 可转移所有权，普通消息克隆可能产生副本；转移后发送方原缓冲区不能继续当作可用数据。',
          example:
            '2 GB 文件若主线程和 Worker 同时保留整份 ArrayBuffer，页面可能先因内存压力失败。更稳妥的方案是限制在途分块数，记录 Worker 初始化、计算、消息传输和峰值内存各自的成本。',
          pitfalls:
            'Web Crypto 的 digest 通常接受完整输入，并不是通用的流式增量 Hash 接口；不要把“分块读”与“天然算出整体 Hash”混为一谈。',
          sources: [
            [
              'MDN · Web Workers',
              'https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers',
            ],
          ],
        },
        chain: 'throughput',
      },
      {
        type: 'choice',
        q: 'Redis 分布式锁在分片上传中怎么用？',
        options: [
          '防止用户误操作',
          '用带唯一标识和租期的锁减少重复合并；原子校验持有者后释放，最终提交用持久化状态约束',
          '限制上传速度',
          '防止黑客攻击',
        ],
        answer: 1,
        explain:
          '按上传会话获取带随机 token 和租期的锁，获取失败的请求等待或查询已合并结果；持锁者校验分片并写入本次尝试独有的临时对象。完成后用持久化状态/版本条件原子发布最终对象引用，其他请求返回同一结果。释放锁时必须在 Redis 端原子比较 token 后删除，不能先 GET 再 DEL。锁主要减少重复工作，最终提交约束负责抵抗锁过期后的旧任务。',
        detail: {
          code: '-- 释放锁的 Lua 脚本；KEYS[1] 为锁键，ARGV[1] 为本次 token\nif redis.call("GET", KEYS[1]) == ARGV[1] then\n  return redis.call("DEL", KEYS[1])\nend\nreturn 0',
          example:
            'A 暂停超过租期，B 获取新锁并完成发布，A 恢复后既不能删 B 的锁，也不能覆盖 B 的文件。每次写独立不可变对象，再通过版本条件选择最终引用，可以同时保护锁归属和已发布字节。',
          pitfalls:
            '续期不能保证进程一定及时运行；只对数据库记录去重，但写入同名文件允许覆盖，仍会损坏已发布内容。',
          sources: [
            [
              'Redis · Distributed locks',
              'https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/',
            ],
          ],
        },
        chain: 'merge',
      },
      {
        type: 'choice',
        q: '上传成功率从 70% 提升到 99% 做了哪些优化？',
        options: [
          '换了更快的服务器',
          '分片上传(降低单次失败影响)+断点续传(网络中断可恢复)+动态并发控制(网络好加并发差时减)+秒传+错误重试',
          '只加大了超时时间',
          '用浏览器自带上传',
        ],
        answer: 1,
        explain:
          '这组优化应解释各自降低了哪种失败：分片把整文件失败缩小到局部分片；断点续传恢复已确认进度；有限重试恢复短暂网络错误；动态并发避免持续排队、限流与内存压力；内容复用减少重复传输。再验证最终长度/摘要和合并提交，才能把“请求完成”变成“文件可用”。99% 是否来自这些改动，需要同口径样本支持，不能把功能清单直接当作因果证明。',
        detail: {
          example:
            '100 个唯一文件任务，95 个首次完成、3 个重试后完成、2 个失败：首试成功率 95%，最终成功率 98%。如果一次重试也被算成新任务，或新版本好网用户增多，总体数字会失真。',
          principle:
            '动态并发可以在限定范围内试探：持续成功且有效吞吐增加时小步升并发，出现 429、超时或吞吐不升时降并发，并按 Retry-After 或有抖动退避重试。参数和判据必须由目标网络、设备和服务容量验证。',
          pitfalls:
            '无权限、文件校验失败等错误不应无限重试。分别记录用户取消、超时、重试后完成与内容校验失败，说明成功率的统计窗口。',
        },
        chain: 'rate',
      },
      {
        type: 'truefalse',
        q: '断点续传的思路是：上传前先请求服务端查询已上传的分片列表只传缺失的分片。',
        answer: true,
        explain:
          '这个思路正确，关键是服务端返回“已持久化且校验通过”的分片，而非浏览器本地记住的百分比。恢复时先让用户提供仍可读取的同一文件，匹配上传会话、内容标识、分片大小和总数，再查询清单、补传差集、校验并提交合并。服务端还要校验当前用户有权访问该会话。',
        detail: {
          example:
            '共 100 片，客户端记着 60 片完成，但服务端确认 58 片，则按服务端清单补传另外 42 片。某片写入成功但确认响应丢失，重复上传应按同一会话和分片编号得到兼容结果。',
          pitfalls:
            '同名同大小不证明内容相同；分片方案改变后不能把旧清单按新下标复用。最后一片可以小于标准片长，合并时仍核对总长度与摘要。',
        },
        chain: 'resume',
      },
    ],
  },
  {
    id: 8,
    name: '权限与架构堡垒',
    desc: '权限系统+BFF 架构',
    difficulty: 'hard',
    icon: '🔐',
    questions: [
      {
        type: 'choice',
        q: '以“最近目录规则优先，范围内用户 > 部门 > 角色，同层多角色取允许动作并集”为题设，权限怎样计算并落实到前后端？',
        options: [
          '只读取第一个角色，其余角色与个人规则都忽略',
          '先解析目录生效范围，再处理维度优先级和同层并集；前端展示与服务端授权都遵循规则',
          '不管个人或目录规则如何，都把所有允许动作直接合并',
          '只要 PermissionGuard 隐藏按钮，就可以省略接口授权',
        ],
        answer: 1,
        explain:
          '按题设先确定资源目录的生效规则，再在该范围按用户、部门、角色的优先级选择规则；同层多个角色的允许动作取并集。例：没有个人/部门覆盖，角色甲允许读、角色乙允许编辑，结果是读和编辑；若更高优先级个人规则明确只允许读，则采用个人规则。PermissionGuard 使用服务端计算的结果控制界面，API 仍必须针对每次资源操作重新授权。',
        detail: {
          principle:
            '“用户 > 部门 > 角色”“同层并集”“最近目录覆盖”是不同维度，必须写进一张可执行决策表。显式拒绝、无规则时默认行为、目录移动后的继承变化也要定义。它们不是所有权限系统通用的固定算法。',
          example:
            '决策表可列 resource、action、nearestScope、personalRule、departmentRule、roleUnion 和 expectedResult；至少测个人覆盖多角色、子目录覆盖父目录、没有匹配规则与跨部门移动。',
        },
        chain: 'permission',
      },
      {
        type: 'choice',
        q: '延迟双删策略的具体流程？解决什么问题？',
        options: [
          '两次 DEL 一定使任何并发请求都读到最新值',
          '按约定删缓存、写库、延迟再删，缓解期间旧值回填，但仍须处理慢请求和失效任务失败',
          '延迟只要大于一次 DB 写入耗时就能保证强一致',
          '只要 TTL 足够长，就不会出现旧值回填',
        ],
        answer: 1,
        explain:
          '以“先删缓存—更新数据库—延迟再删一次”为本题约定：第一次删后，读请求可能在写库完成前读到旧值，再把旧值回填；第二次删除试图清除这次旧回填。它缓解一类并发读写窗口，并不保证强一致。延迟长度要根据旧读请求从开始到回填完成的分布估计，不能仅取数据库写入耗时，也不能认为任意固定延迟覆盖所有慢请求。',
        detail: {
          example:
            't0 删缓存；t1 读请求 R 读到旧值 v1；t2 写库得到 v2；t3 第二次删缓存；t4 慢请求 R 才把 v1 填回。此时双删已经执行但缓存仍旧，因此需要可靠的失效任务、版本约束或对关键授权读取权威状态。',
          pitfalls:
            '进程内 setTimeout 可能随重启丢失。延迟任务要有可恢复的承载方式与失败观测；撤权、资金资格等场景先定义最大可接受陈旧窗口，再选一致性方案。',
          followups: [
            [
              '先写库再删缓存能不能更好？',
              '它也是常见 cache-aside 写路径，但删除失败、复制滞后和并发旧回填仍需处理。回答时声明自己实际采用的顺序并画出时间线，不能把某一种双删顺序当作唯一标准。',
            ],
          ],
        },
        chain: 'rdata-cache-timeline',
      },
      {
        type: 'choice',
        q: 'BFF 层的动机是什么？解决了什么问题？',
        options: [
          'BFF 是行业趋势大家都用',
          '前端直连多个异构下游(ERP/SSO/文件存储)导致耦合高鉴权散乱；BFF 统一接口聚合与权限校验后端变更对前端透明',
          '让项目看起来更复杂',
          '前端不能直接调后端接口',
        ],
        answer: 1,
        explain:
          'BFF 是按某类前端体验组织的服务边界。本题中，页面原先分别调用 ERP、SSO、存储和预览服务，反复处理不同 DTO、鉴权与错误；BFF 可以统一前端接口、聚合必要数据、裁剪字段和映射业务错误，使下游变化更多留在适配层。它新增了一跳、运维工作和可能的瓶颈，因此应有明确聚合收益，核心资金或权限规则也不能只在 BFF 留一份而绕过最终执行系统的校验。',
        detail: {
          example:
            '文件详情响应可以包含文件元数据、当前用户动作权限与预览状态；推荐内容单独标记 unavailable。授权失败不能降级成“允许”，推荐超时则可以保留文件主功能。',
          pitfalls:
            'BFF 与 API 网关不完全相同：网关偏通用流量入口，BFF 偏特定客户端的数据与交互需要；实际系统可组合部署。',
          sources: [
            [
              'Microsoft · Backends for Frontends',
              'https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends',
            ],
          ],
        },
        chain: 'aggregate',
      },
      {
        type: 'choice',
        q: 'Monorepo 共享 TypeScript 类型定义的好处和代价？',
        options: [
          '类型共享后任何历史数据和旧客户端都自动兼容',
          '编译期减少重复定义与部分漂移，同时需要管理依赖和发布边界，并补运行时校验',
          'Monorepo 必须让所有服务每次一起部署',
          'TypeScript 类型会随 JSON 自动传到运行时进行校验',
        ],
        answer: 1,
        explain:
          '共享 DTO、枚举和接口类型，使一起编译的前后端代码在字段增删时更早报错，也减少重复定义；Monorepo 还便于查看一次变更影响的调用方。但类型会在运行时被擦除，老前端、独立发布的服务与历史 JSON 不会因此自动正确。代价包括共享包依赖和版本边界、受影响构建、工具配置、跨团队权限与耦合管理。',
        detail: {
          example:
            '把 required 的 name 改成 displayName，共享包能让当前源码的旧引用编译失败；一周前打开的浏览器仍可能请求旧字段。发布应先增加新字段并保留旧字段，再升级消费者，观察旧版本窗口后才移除旧字段。',
          principle:
            '公共包优先放稳定 DTO 与运行时 schema，避免直接暴露数据库实体。CI 按依赖图检查受影响包；锁文件与全局编译配置变化时扩大验证范围。',
          pitfalls: '“共享类型消除所有联调类型漂移”过强。还需要网络边界校验与消费者/提供方契约验证。',
        },
        chain: 'contract',
      },
      {
        type: 'text',
        q: 'BFF 层会不会成为单点瓶颈？怎么保证可用性？',
        answer: '可用性',
        explain:
          '会：如果所有页面依赖单个 BFF 实例，它故障就会阻断入口；即使有多副本，无界聚合和重试也会耗尽资源。先将会话与任务状态放到合适的共享存储，BFF 多实例通过负载均衡接流量；设置入口 deadline、下游超时、并发/队列上限和可选依赖降级。用就绪检查接流、排空在途请求再停机，并验证回滚的资源和数据兼容。',
        detail: {
          example:
            '入口预算 800 ms，鉴权预算 100 ms、核心查询在剩余预算内并行，留出序列化和返回时间；推荐查询最多等待较短预算，超时返回“推荐不可用”。不要让四个串行下游各自都等待 800 ms。',
          followups: [
            [
              '扩到十个实例仍慢怎么办？',
              '分别看事件循环延迟、下游尾延迟、连接池等待和共享存储负载。瓶颈在依赖时加实例可能放大请求数，应先限流和控制放大系数。',
            ],
          ],
          sources: [
            [
              'Microsoft · Backends for Frontends',
              'https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends',
            ],
          ],
        },
        chain: 'aggregate',
      },
      {
        type: 'text',
        q: '权限变更后缓存没更新用户看到不该看的菜单怎么办？',
        answer: '缓存',
        explain:
          '先判断是旧菜单显示还是仍能访问资源。撤权提交后，服务端资源接口必须按照满足撤权时效的策略检查身份、资源和动作；仅隐藏按钮不能构成安全边界。使受影响缓存失效，或推进策略/组织版本让旧缓存不可再用；前端在重新聚焦、推送通知或下一次请求中刷新动作集，保留允许保留的草稿并解释状态变化。',
        detail: {
          example:
            '用户编辑到一半被撤销写权限：保存请求返回明确的授权错误，不写入数据；页面关闭提交入口并保留本地草稿供复制。测试同时从旧标签页直接发 API 请求，断言后端拒绝且业务记录未变化。',
          pitfalls:
            '“加 5 分钟 TTL”意味着可能有相应陈旧窗口，并不等于立即撤权。个人、部门、角色与目录继承变化会影响不同范围，单纯删除一个 userId 键可能漏掉其他入口。',
        },
        chain: 'revoke',
      },
    ],
  },
  {
    id: 9,
    name: '终极面试 BOSS',
    desc: '自我介绍+开放性问题',
    difficulty: 'boss',
    icon: '👑',
    questions: [
      {
        type: 'text',
        q: '请做一个自我介绍（1分钟）。',
        answer: '自我介绍',
        explain:
          '参考开场：“我是叶正雄，有约五年研发经历，前期做 Python，之后主要做 Vue 和 React 的企业应用。最近在中软国际驻场腾讯参与微信支付运营平台，承担前后端交付和 PHP 到 Node.js/TypeScript 的接口迁移。之前在文档协同平台做过大文件上传、权限控制和 BFF，也参与工程驾驶舱与工程化交付。我比较熟悉复杂业务状态和异常链路，想结合一个迁移接口或上传恢复流程展开。” 这是按简历主题组织的口述模板，具体模块、个人负责程度与工作时间须按真实经历调整，不表示这些成果均由个人主导。',
        detail: {
          principle:
            '60 秒安排：10 秒交代岗位与技术背景，20 秒最近项目与个人职责，20 秒另一项能深入的难点，10 秒给出可追问入口。数字和“主导”只使用能解释统计及职责的表述。',
          pitfalls:
            '总研发年限与前端岗位时间要分开。不要把团队 19 个接口的迁移总量自动说成全部由个人完成，也不用逐段复述每份工作。',
          followups: [
            [
              '只让讲最熟悉的一件事？',
              '选能画流程、说明一个失败样例并给出验证结果的模块，直接用“原问题—我的动作—验证结果”开场。',
            ],
          ],
        },
        chain: 'intro',
      },
      {
        type: 'text',
        q: '迁移 19 个 PHP 接口时遇到的最大挑战？怎么解决？(STAR 法则)',
        answer: 'STAR',
        explain:
          '可围绕“无损类型转换与兼容迁移”组织一个具体 STAR 回答：S，存量 PHP 接口依赖 RPC，迁移仍要兼容现有调用方；T，在负责范围内保持字段、权限、错误码与副作用一致；A，列契约样例，定位 Long/Buffer/空值差异，把转换收敛到适配层，使用隔离数据验证写路径并分批切流；R，报告实际交付接口、验证结果与观察窗口。选择真正经历过的挑战填入，不能把示范直接当成个人事实。',
        detail: {
          example:
            '具体技术展开示例：相邻两个 64 位 ID 经 Number 转换后相同。沿 RPC→DTO→JSON→页面定位首次有损点，改成从 Long 直接转字符串；用相邻大整数回归并检查日志序列化。这样能回答“你具体解决了什么”，而不只是列分层名词。',
          pitfalls:
            '“六周、9000+ 行、零事故”是结果与规模，不是困难本身。追问时讲你亲手做的代码/样例/发布步骤及失败前后的证据。',
        },
        chain: 'star',
      },
      {
        type: 'text',
        q: '你觉得自己最大的不足是什么？',
        answer: '不足',
        explain:
          '可以选择一个真实且正在改善的工作习惯，讲清影响与改进证据。示范：“以前我分析性能问题容易先从熟悉的前端渲染入手，后来发现这会漏掉网络和下游等待。现在先拆用户动作的时间线，分别看请求、主线程与业务终态，再做单变量对照。还需要继续加强的是长期线上分层指标的设计。”仅在符合真实经历时使用，并准备一次具体例子。',
        detail: {
          principle:
            '回答结构是“具体不足—曾经造成的影响—采取的动作—观察到的变化”。学历属于背景条件，不必把它包装成技术能力缺陷；也不需要宣称不存在任何与岗位有关的短板。',
          followups: [
            [
              '怎样证明已经改善？',
              '给一份前后不同的排查流程、一个被证据推翻的假设，或一个新加入的回归用例；没有定量记录就描述可核实的行为变化。',
            ],
          ],
        },
      },
      {
        type: 'text',
        q: '你对 AI 工程化有实践能具体说说吗？',
        answer: 'AI',
        explain:
          '应选一个实际做过的 AI 功能讲完整闭环，而非只报 LLM、MCP、SSE 名词。可用下面的示范结构：“输入是文档与用户问题；服务端做身份和输入校验，构造上下文后调用模型；前端按 SSE 协议增量展示，停止时传递取消；模型提出工具调用后，由服务端校验参数与权限再执行；我用固定问题集比较结果正确性、延迟和费用。”把示范替换为真实模型、接口、范围和故障案例。',
        detail: {
          example:
            '可选一例：“流式响应把一个中文字符拆在两个数据块，直接逐块转字符串会乱码；我使用持续的解码状态，并分别处理文本字节和 SSE 事件边界，再测取消与断线。”若实际做的是 Skill，则展示输入、模块目录、执行边界和产物。',
          pitfalls:
            '个人试验、内部工具与线上业务分别说明。单次对话成功不能推出固定提效比例；工具参数通过 schema 也不等于有执行权限。',
        },
        chain: 'integration-skill',
      },
      {
        type: 'text',
        q: '你还有什么想问我们的？(反向提问)',
        answer: '提问',
        explain:
          '可以优先问两个与岗位决策相关的问题：“这个岗位入职前三个月最需要解决的业务或工程问题是什么，怎样判断做得好？”以及“前端在接口设计、上线验证与线上故障中承担哪些责任？”若对方提到性能或 AI，再沿真实案例追问当前约束、已有方案和协作方式。薪酬、工作安排等合理问题可在合适阶段向招聘方了解，不必视为禁区。',
        detail: {
          example:
            '对方说需要提升发布效率，可以追问：“目前慢在构建、测试、审批还是上线验证？团队最近一次缩短周期的改动是什么？”这能判断你的 CI/CD 经验是否与实际需要相符。',
          pitfalls:
            '不要一次问十个大问题，也别把反问变成对团队技术选择的考试。先听回答再追问，记录与你是否适合岗位有关的信息。',
        },
      },
      {
        type: 'text',
        q: '为什么从上一家公司离职？',
        answer: '离职',
        explain:
          '这道题必须使用真实离职原因。可按“客观背景—我的选择标准—与新岗位的联系”回答，例如仅在属实时说：“上一阶段主要工作已完成，我希望下一份工作继续承担复杂前端与服务端协同交付，尤其关注更明确的工程责任和成长空间，所以开始寻找匹配岗位。”若实际是项目结束、合同调整或个人安排，应直接说相应事实，再说明为何选择当前岗位。',
        detail: {
          principle:
            '回答一两分钟内讲清即可。说明已完成的交接、对前一段经历的收获和本次选择依据；避免凭空编造“主动追求更高挑战”来覆盖真实情况。',
          followups: [
            [
              '面试官追问为什么现在离开？',
              '给出真实时间点与触发条件，并说明这一条件如何影响求职安排。个人隐私可以保留到必要程度，但不应编造工作经历。',
            ],
          ],
        },
      },
      {
        type: 'choice',
        chain: 'conflict',
        q: '产品要求周五发布，但高风险流程还有两个异常分支没验证。作为前端负责人，推动决定的第一步是什么？',
        options: [
          '直接拒绝上线，等全部验证完再说',
          '把未验证分支的影响、可检测性和可撤回性说清，提出可选范围与停止条件',
          '先上线，出了问题再回滚',
          '让产品单方面决定，自己不留下书面判断',
        ],
        answer: 1,
        explain:
          '有效的推动不是二选一式的表态，而是把决策所需的信息摊开：这两个分支影响哪些用户、出了问题能否被观测到、能否快速撤回。在此基础上给出可选范围，比如先开放已验证的查询、延后写入入口，同时写明负责人、验收条件和下一次决策时间。',
        detail: {
          example:
            '产品要周五发，高风险流程还有两个异常分支没测。直接说“不行”会被当成不配合，直接发又是在赌。可用的做法是把信息摆出来：“分支 A 影响退款金额，出错用户能看到，但日志里有专门埋点；分支 B 一旦出错会写脏数据且无法回滚。”然后给选项：只放查询、把写入入口延到下周、或者带上回退人和停止条件一起发。',
          pitfalls:
            '把“质量”当成一句口号而不给具体后果，对方无法据此决策。只讲风险不讲可选方案，等于把决定权推回去。“以前都没出问题”不是证据，需要在隔离数据上做一次最小复现。即使最终决定按时上线，也要留下约定的范围、观察指标、停止条件和回退负责人。',
        },
      },
    ],
  },
];
