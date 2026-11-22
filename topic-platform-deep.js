'use strict';

{
  const group = 'platform-deep';
  const cards = [
    {
      id: 'platform-stacking',
      title: '弹窗的 z-index 写到一百万仍被导航遮住',
      group,
      source: [
        'MDN · Stacking context',
        'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context',
      ],
      check: '能画出两个祖先层叠上下文，解释子元素数值为何不能越过祖先。',
      steps: [
        [
          '内容区 position:relative、z-index:1，导航 z-index:2。内容区里的弹窗设 z-index:999999，为什么仍可能在导航下面？',
          '先确认二者所在的层叠上下文。内容区及其后代作为整体参与外层排序，子弹窗的巨大数值只在内部排序。提高祖先层级或把覆盖层挂到合适的公共容器，需要同时评估其他浮层。',
        ],
        [
          '原来正常，父元素加了一句 transform:translateZ(0) 后出问题，为什么？',
          '非 none 的 transform 会建立层叠上下文，并可能改变定位后代的包含块。检查实际计算样式与祖先链，再判断遮挡和位置偏移是否来自不同原因。',
        ],
        [
          '弹窗移到 body 下就能完全解决吗？',
          '它改变了 DOM 祖先关系，仍要检查自身样式、焦点、滚动锁和应用层事件。若使用原生模态 dialog，元素会进入顶层；选用之前需验证应用所需交互与目标浏览器行为。',
        ],
        [
          '怎样写出能覆盖这次问题的验收条件？',
          '在页面包含 sticky 导航、transform 容器与滚动区时打开浮层，检查覆盖顺序、定位和滚动。再测两个浮层叠加、关闭后焦点恢复，以及窄屏和放大后的可操作性。',
        ],
      ],
    },
    {
      id: 'platform-grid',
      title: '卡片最后一行需要对齐上面三列，Flex 换行为什么错位',
      group,
      source: [
        'MDN · Grid basic concepts',
        'https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Basic_concepts',
      ],
      check: '能从行列共享约束选择布局，并解释固定列与自动列各自的空位行为。',
      steps: [
        [
          '四张卡片按三列显示，最后一张必须和第一列同宽同位置。用 flex-wrap 配合 flex-grow 为什么最后一行可能铺满？',
          'Flex 的每条换行分别分配剩余主轴空间，最后一行只有一个可增长项就可能扩张。跨行共享列轨道的需求可用 Grid 三列；也可给 Flex 项明确基准尺寸并关闭增长。',
        ],
        [
          '如果容器宽度变化时希望自动变成两列或一列，怎样让最小卡片宽度参与决定？',
          '例如最小卡片宽度定为 16rem，可用 repeat(auto-fit, minmax(min(100%, 16rem), 1fr))：容器放得下几列就生成几列，剩余空间按 fr 分配；内部 min(100%,16rem) 让窄于 16rem 的容器降为一列而不被固定最小值撑出横向滚动。auto-fit 会折叠完全空的轨道；若需要宽容器里只有一张卡时也保留空槽，应改为 auto-fill。↵.cards {↵  display: grid;↵  grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr));↵  gap: 1rem;↵}↵.card { min-width: 0; overflow-wrap: anywhere; }',
        ],
        [
          'auto-fit 与 auto-fill 在只有一张卡片的宽容器上有何差别？',
          '二者都会按规则计算重复轨道。auto-fit 会折叠没有项目的重复轨道，剩余项目可扩展；auto-fill 保留这些空轨道。需要保留空列槽位时应验证 auto-fill 的布局。',
        ],
        [
          '如何验证布局在真实内容下稳定？',
          '组合一张、四张和很多张卡片，加入长标题、缺失封面、较大字号并改变容器宽度。核对列对齐、空位行为、阅读顺序与键盘顺序，避免视觉重排改变理解。',
        ],
      ],
    },
    {
      id: 'platform-delegation',
      title: '事件委托收到的是按钮里的图标，怎样找到真正的操作',
      group,
      source: [
        'MDN · Event bubbling',
        'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling',
      ],
      check: '能区分 target、currentTarget 和默认行为，给出一次委托边界验证。',
      steps: [
        [
          '列表只在容器绑定 click，点击删除按钮里的图标时，event.target 不是 button。如何确定用户点了什么？',
          "event.target 是点击起点，可能是按钮里的图标；event.currentTarget 是绑定监听的列表。先确认 target 是 Element，再 closest 找 data-action 按钮，并检查它仍在当前容器内、没有属于嵌套的另一份列表，最后读 data-id。下面约定每个列表有 data-list，删除函数由业务注入；卸载时执行返回的清理函数。↵function bindActions(list, removeById) {↵  function click(e) {↵    if (!(e.target instanceof Element)) return;↵    const button = e.target.closest('button[data-action=\"delete\"]');↵    if (!button || !list.contains(button) || button.closest('[data-list]') !== list) return;↵    if (button.disabled || !button.dataset.id) return;↵    removeById(button.dataset.id);↵  }↵  list.addEventListener('click', click);↵  return () => list.removeEventListener('click', click);↵}",
        ],
        [
          '为了阻止点击删除后进入详情，只调用 preventDefault 足够吗？',
          'preventDefault 取消可取消的默认动作，例如链接导航；它不会停止事件向祖先传播。应避免嵌套冲突交互，并在明确需要时处理传播，或让行点击逻辑识别操作控件区域。',
        ],
        [
          '所有子按钮都调用 stopPropagation，会给上层埋点或委托带来什么影响？',
          '它会让后续祖先监听收不到该次传播。先明确哪些监听依赖冒泡，再选择在业务入口过滤目标。捕获阶段适合某些观察需求，但仍应尊重事件是否已处理和数据最小化。',
        ],
        [
          '动态插入的新按钮为什么无需重新绑定？如何测试重复执行？',
          '委托依赖事件传播到稳定容器，新增子项也走同一监听。测试图标点击、文本点击、动态插入、移除与重新挂载，断言每次有效点击只执行一次，并检查旧容器监听已清理。',
        ],
      ],
    },
    {
      id: 'platform-dialog',
      title: '确认弹窗视觉正确，键盘用户却操作到背景页面',
      group,
      source: ['W3C WAI · Modal Dialog Pattern', 'https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/'],
      check: '能定义打开、Tab 循环、关闭和恢复焦点的完整行为。',
      steps: [
        [
          '删除确认弹窗打开后焦点还在背景按钮上，应该先修哪段行为？',
          '把焦点移入弹窗中合适的位置，并提供可识别的名称。简短确认可聚焦安全的动作，较长内容可先聚焦标题或说明区域；背景应在模态期间不可交互。',
        ],
        [
          '只设置 role="dialog" 和 aria-modal="true" 会自动完成焦点限制吗？',
          '这些属性描述语义，交互仍需由原生组件或实现承担。验证 Tab 与 Shift+Tab 留在弹窗中、关闭按钮可达，Escape 按产品约定关闭，并避免用户进入被遮挡的背景。',
        ],
        [
          '关闭弹窗后，触发它的那一行已经被删除，焦点放到哪里？',
          '通常回到触发元素；元素已消失时选择符合工作流的相邻项、列表容器或下一步操作。明确这种退路，避免焦点落回 body 使键盘用户重新遍历整个页面。',
        ],
        [
          '只用自动无障碍扫描通过，可以验收了吗？',
          '补充真实键盘顺序和辅助技术的名称与状态验证。测试长内容滚动、校验失败、二次打开、触发元素消失和缩放后关闭按钮仍可见，检查视觉与交互的实际配合。',
        ],
      ],
    },
    {
      id: 'platform-images',
      title: '手机加载了桌面大封面，还把正文向下顶了一截',
      group,
      source: [
        'MDN · Responsive images',
        'https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images',
      ],
      check: '能分清候选资源、布局槽位、裁切方向和空间预留四个问题。',
      steps: [
        [
          '卡片在手机里宽 320 CSS 像素，却下载 2400 像素封面。srcset 和 sizes 各提供什么信息？',
          'srcset 的 w 描述符声明每张候选图实际有多少像素宽，sizes 描述当前布局准备给图像多宽的 CSS 槽位。浏览器结合槽位、DPR 和资源等选择候选：槽位 320 CSS px、DPR=2 时，640 像素候选通常更合适，但浏览器不承诺固定选择。srcset 中的宽度必须与文件固有宽度相符；sizes 不负责设置 CSS 宽度。下面示例给 320px 槽位提供三档等比例图片，并以 width/height 预留比例。↵<img src="cover-640.jpg"↵     srcset="cover-320.jpg 320w, cover-640.jpg 640w, cover-960.jpg 960w"↵     sizes="(max-width: 352px) calc(100vw - 32px), 320px"↵     width="640" height="400" alt="文档封面"↵     style="display:block; width:320px; max-width:100%; height:auto">',
        ],
        [
          '写了 sizes="320px"，就能让图像按 320px 宽度显示吗？',
          'sizes 用于资源选择，实际布局尺寸由 CSS 和元素约束决定。核对 currentSrc、实际渲染宽度与设备像素比，防止资源选择提示和页面布局互相矛盾。',
        ],
        [
          '移动端还要求只显示人物近景，缩小同一张横幅够吗？',
          '这是内容裁切方向的需求，可用 picture 的 source 按条件选择不同构图，再由 img 提供默认图与替代文本。清晰度切换和构图切换应各自有明确规则。',
        ],
        [
          '图片晚到导致内容下移，怎样验证修复？',
          '在图片加载前通过正确宽高比例预留空间，必要时为不同构图设置对应比例。用慢网、缓存关闭和加载失败观察页面移动，同时检查裁切是否遮住主体及占位是否与实际尺寸一致。',
        ],
      ],
    },
    {
      id: 'platform-sw',
      title: '新 Service Worker 已安装，旧标签页为何还在运行旧逻辑',
      group,
      source: [
        'MDN · Using Service Workers',
        'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers',
      ],
      check: '能解释等待激活的原因，并定义带草稿的页面如何完成安全升级。',
      steps: [
        [
          '线上检测到新 Service Worker 已安装，但打开的旧页面没变。你先检查哪些状态？',
          '分别检查注册的 installing、waiting、active worker 与页面当前 controller。新版本通常等待旧版本控制的页面退出后再激活；安装成功只说明安装阶段完成。',
        ],
        [
          '调用 skipWaiting 后，是否也自动替换了旧页面正在运行的 JavaScript？',
          '它请求新 worker 尽快激活，已有页面内加载的应用代码仍是原版本。新 worker 接管网络请求时可能与旧页面代码组合，因此需要约定资源和消息协议的跨版本兼容。',
        ],
        [
          '用户正在填写申请，怎样提供更新入口？',
          '提示可用更新，保留草稿并等待用户确认，在确定新版本就绪后协调刷新。资源按版本组织，清理缓存前考虑仍在使用的页面；失败时展示可重试的状态。',
        ],
        [
          '怎样设计一个覆盖真实升级的用例？',
          '先打开旧版本并填写草稿，再部署新 worker，保留另一个旧标签页。分别检查等待、激活、刷新后的资源版本、离线行为及草稿恢复，避免只测全新安装。',
        ],
      ],
    },
    {
      id: 'platform-idb',
      title: 'IndexedDB 写入成功回调触发，为什么仍丢了整批草稿',
      group,
      source: [
        'MDN · Using IndexedDB',
        'https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB',
      ],
      check: '能区别单请求成功与事务完成，并处理跨标签页升级阻塞。',
      steps: [
        [
          '一笔 readwrite 事务写入三条草稿，第一条请求 onsuccess 后就提示保存成功，有什么缺口？',
          '单个请求成功时事务仍可能因后续请求失败而中止。把业务保存成功绑定到事务完成，监听事务中止与错误；需要一起生效的记录放在同一事务范围内。',
        ],
        [
          '创建事务后先 await fetch，再继续使用它，为什么会遇到 TransactionInactiveError？',
          '事务活跃期受事件循环和请求调度约束，空闲时可能自动提交。先取得网络数据，再创建短事务完成本地写入；不要用长事务等待任意异步工作。',
        ],
        [
          '新版本增加索引，旧标签页还开着，数据库升级一直等怎么办？',
          '旧连接应监听 versionchange 并关闭，升级方处理 blocked 提示，帮助用户关闭或刷新占用页面。升级失败时保留明确状态，避免界面永远显示初始化中。',
        ],
        [
          '如何验证“保存成功”确实能恢复？',
          '在事务完成后重新打开数据库读取并核对整批数据，再测试配额不足、中途 abort、并发标签页和旧版本升级。报告本地保存失败时保留可重试草稿和可理解的反馈。',
        ],
      ],
    },
    {
      id: 'platform-side-effects',
      title: '组件库打开 tree shaking 后，按钮样式突然消失',
      group,
      source: ['webpack · Tree Shaking', 'https://webpack.js.org/guides/tree-shaking/'],
      check: '能解释导出使用与模块副作用的不同分析，并设计生产产物回归。',
      steps: [
        [
          '组件库 package.json 设置 sideEffects:false，按需引入按钮后只有样式没了，先查什么？',
          '检查 CSS 是否靠副作用 import 引入，以及包是否把该文件错误声明为可丢弃。导出使用分析与整模块副作用声明有不同职责，应将确有副作用的样式等文件纳入声明。',
        ],
        [
          '组件没被使用，但它导入了一份全局样式。把所有 CSS 标为有副作用能保证这份样式总被加载吗？',
          '还要看模块是否位于保留的导入路径。上层未使用的组件子树可能整体被移除；必须无条件生效的全局样式应有明确、实际执行的入口导入。',
        ],
        [
          '给所有文件都声明有副作用会怎样？',
          '能减少误删风险，也会限制可跳过的模块范围。先识别注册、样式和 polyfill 等真正副作用，再对纯模块保留优化空间，并检查公共入口有没有隐藏初始化行为。',
        ],
        [
          '开发模式看起来正常，怎么验收这个修改？',
          '建立小型消费页面只导入目标组件，运行生产构建后检查样式、注册行为和产物依赖。再做零导入与多组件组合样例，核对正确性和体积变化。',
        ],
      ],
    },
    {
      id: 'platform-bisect',
      title: '三天里合并了六十次提交，怎样定位首次引入白屏的变更',
      group,
      source: ['Git · git bisect', 'https://git-scm.com/docs/git-bisect'],
      check: '能定义可重复的好坏判据，并正确处理无法构建的候选提交。',
      steps: [
        [
          '已经确定一个正常提交和一个白屏提交，你怎样减少逐个查看的成本？',
          '先固定复现步骤和依赖环境，再用 git bisect 在好坏边界之间逐步测试候选提交。每次标记 good 或 bad，将范围缩小；前提是这个区间的好坏变化适合二分定位。',
        ],
        [
          '候选提交依赖旧工具链，今天无法构建。直接标记 bad 会造成什么后果？',
          '构建环境问题和目标白屏回归不同，混用判据会定位到错误提交。尽量恢复对应环境，确实无法判断时使用 skip；若关键范围有跳过项，最终结果可能是一组候选。',
        ],
        [
          '把检查自动化为 bisect run，脚本退出码怎么设计？',
          '0 表示 good；1–127 中除 125 外表示 bad；125 表示 skip；其他退出码会中止 bisect。例如命令不存在的 127 也会被判 bad，脚本要把环境故障明确映射为跳过或中止。先用已知好坏提交验证脚本。',
        ],
        [
          '定位到某次合并，就能认定作者的那段代码是唯一原因吗？',
          '检查具体差异、依赖和交互条件，做最小复现或验证性回退。首个表现为坏的提交提供线索；修复后补覆盖该触发路径的测试，并结束 bisect 恢复原工作状态。',
        ],
      ],
    },
    {
      id: 'platform-sourcemap',
      title: '线上错误都在 app.min.js 第一行，怎样还原到具体组件',
      group,
      source: ['MDN · Source map', 'https://developer.mozilla.org/en-US/docs/Glossary/Source_map'],
      check: '能把压缩资源、映射、构建版本和一次受控异常对应起来。',
      steps: [
        [
          '线上上报 app.min.js:1:28491，如何定位到原 TypeScript 文件？',
          '收集实际资源 URL、行列号与构建标识，找到同次构建产出的 source map 做位置映射。浏览器执行的是转换后的代码，映射将该位置关联到原始源文件与位置。',
        ],
        [
          '拿本地最新代码重建一份 map，为什么可能映射到完全无关的行？',
          '提交、依赖、构建选项与压缩结果变化都会改变生成位置。应保存与线上产物绑定的 map，并使用资源哈希或发行版本准确索引。',
        ],
        [
          '禁止浏览器公开下载 map，会影响内部错误平台还原吗？',
          '内部平台可按权限保存并使用映射，浏览器能否获取是另一条分发路径。需要核对 map 是否包含原始源码、访问范围及上传后的版本关联，避免上传成功却匹配不上。',
        ],
        [
          '上线前怎样验证整个定位链路真的有效？',
          '在受控页面触发已知位置的异常，用最终生产构建检查上报的资源、行列和版本，再确认平台还原到预期文件。测试旧版本标签页同时上报时也能选中各自的映射。',
        ],
      ],
    },
  ];
  PRACTICE_BANK.groups.push({id: group, name: '浏览器界面与工程细节', cards: cards.map((card) => card.id)});
  for (const card of cards) PRACTICE_BANK.cards[card.id] = card;
  TOPIC_LEVELS.push({
    id: 23,
    name: '浏览器与交付细节',
    desc: 'CSS、事件、无障碍、离线存储与构建排障',
    difficulty: 'hard',
    icon: '🧰',
    questions: [
      {
        type: 'choice',
        chain: 'platform-stacking',
        q: '父内容区处于 z-index:1 的层叠上下文，导航为同层 z-index:2。内部弹窗的 z-index 再大仍被遮住，最合理的排查是什么？',
        options: [
          '把内部数值继续乘十',
          '检查并调整祖先层叠关系与浮层挂载位置',
          '给弹窗添加更长的 CSS 选择器',
          '给弹窗改成更大的字体',
        ],
        answer: 1,
        explain:
          '先画出祖先层叠上下文：内容区及后代整体在外层以 z-index:1 排序，内部的 999999 只能赢过该内容区内部兄弟，无法越过外层的导航 2。可调整公共祖先层级、把浮层挂到合适的公共容器，或按需求使用进入顶层的原生模态 dialog。还需排查 transform、opacity 等建立的新上下文及 overflow 裁切。',
        detail: {
          example:
            '内容区是 position:relative; z-index:1，导航是 z-index:2，弹窗写在内容区里、数值加到 999999 依然被导航盖住。原因是内容区和它的后代作为一个整体在外层按 1 排序，弹窗的 999999 只能赢过内容区内部的兄弟，越不过外层的 2。要么把内容区整体抬高，要么把浮层挂到 body 下或用原生 dialog 进入顶层。另外父元素某次加了 transform:translateZ(0)，会新建层叠上下文，问题会在那次改动后突然出现。',
          code:
            '/* 错误：弹窗被困在 z-index:1 的上下文里 */\n.content { position: relative; z-index: 1; }\n.nav     { position: sticky; z-index: 2; }\n.modal   { position: fixed; z-index: 999999; }  /* 仍在 .content 内部 */\n\n/* 修复方向之一：用原生 dialog 进入顶层 */\n<dialog open>…</dialog>',
          pitfalls:
            '继续把数值乘十，永远解决不了跨上下文的比较。给弹窗加更具体的选择器只影响优先级，不改层叠上下文。父级出现 transform、opacity<1、filter、will-change 都会新建上下文，是“昨天还好好的”这类问题的常见来源。overflow:hidden 的祖先还会把浮层裁掉一部分，这跟层级是两回事。',
        },
      },
      {
        type: 'choice',
        chain: 'platform-grid',
        q: '宽容器里只有一张卡片，产品希望为后面的卡片保留空列槽位，应优先验证哪个重复轨道设置？',
        options: ['auto-fill', 'auto-fit', '所有项目设 position:absolute', '给唯一卡片设置 flex-grow:1'],
        answer: 0,
        explain:
          'auto-fill 会保留按容器宽度计算出的空轨道；auto-fit 在布局后折叠空轨道，剩余 1fr 轨道可能扩宽。示例 grid-template-columns:repeat(auto-fill,minmax(200px,1fr)) 在宽容器只有一个项目时仍保留其他列槽位。容器窄于最小轨道时还需调整最小值，避免水平溢出。',
        detail: {
          example:
            '宽容器里只有一张卡：用 auto-fit 时空轨道被折叠，剩下那一列会被 1fr 拉宽铺满整行；用 auto-fill 时空轨道保留，卡片仍按原宽度呆在第一列，后面的槽位空着。产品要的就是后者的效果。容器窄到放不下最小轨道时，还要用 min(100%, 最小值) 兜一下，否则会撑出横向滚动。',
          code:
            '.cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));\n  gap: 1rem;\n}\n.card { min-width: 0; overflow-wrap: anywhere; }',
          pitfalls:
            'auto-fit 和 auto-fill 的区别只在“有没有空轨道可折叠”，容器刚好放满时两者表现一样，容易误判。flex-wrap 的每一行各自分配剩余空间，最后一行只有一项时会铺满，做不到跨行对齐。给唯一卡片加 flex-grow:1 正好加剧了这个问题。',
        },
      },
      {
        type: 'truefalse',
        chain: 'platform-delegation',
        q: '点击按钮图标时调用 preventDefault，会自动阻止该 click 事件传播到列表容器。',
        answer: false,
        explain:
          '错误。preventDefault 取消可取消的默认行为，如链接跳转；stopPropagation 才停止继续传播，但也会影响上层委托和埋点。图标点击可用 target.closest 找按钮，并验证它属于当前列表。行点击与操作按钮最好在入口识别目标范围，避免所有子元素无差别停止传播。',
        detail: {
          example:
            '列表只在容器上绑 click，点删除按钮里的图标时 event.target 是那个图标，不是 button。硬按 target 判断就会漏掉。要在处理函数里用 closest 往上找带 data-action 的按钮，再确认它确实属于当前这个列表、不是嵌套的另一份列表。这样动态插入的新按钮也自动生效，不用重新绑定。',
          code:
            'function bindActions(list, removeById) {\n  function click(e) {\n    if (!(e.target instanceof Element)) return;\n    const btn = e.target.closest(\'button[data-action="delete"]\');\n    if (!btn || !list.contains(btn)) return;\n    if (btn.closest(\'[data-list]\') !== list) return;   // 排除嵌套列表\n    removeById(btn.dataset.id);\n  }\n  list.addEventListener(\'click\', click);\n  return () => list.removeEventListener(\'click\', click);\n}',
          pitfalls:
            'preventDefault 管的是默认动作（比如链接跳转），和事件传播完全是两件事，这是本题的核心混淆点。所有子按钮都调 stopPropagation，会让上层埋点和委托监听收不到事件。不校验 closest 结果是否属于当前列表，嵌套列表里的点击会误删外层数据。绑定后不清理，重复挂载会执行多次。',
        },
      },
      {
        type: 'choice',
        chain: 'platform-dialog',
        q: '删除确认弹窗关闭时，原触发按钮随记录一起消失。焦点应该如何恢复？',
        options: [
          '永远回到 body',
          '保持在已移除的节点',
          '放到符合后续工作流的相邻项或列表入口',
          '自动打开另一个弹窗',
        ],
        answer: 2,
        explain:
          '先尝试恢复到仍存在的触发按钮；该行已删除时，选择下一项、上一项或列表标题等符合后续操作的位置，并确保目标可聚焦。不要继续 focus 已移除节点。弹窗打开时还应移入焦点、保持键盘操作在模态范围内，并让背景不可交互，关闭后解除这些约束。',
        detail: {
          example:
            '确认删除后弹窗关闭，可那一行已经从列表里删掉了，焦点如果回到原来的按钮就会落空，键盘用户只能从页面开头重新 Tab。正确做法是回到仍然存在的触发按钮；它已经没了，就落到相邻的那一行或列表标题上。另外弹窗打开时要先把焦点移进去、把 Tab 限制在弹窗内、让背景不可交互，关闭时再解除。',
          pitfalls:
            '焦点永远丢回 body 是键盘用户最讨厌的体验，等于重新遍历整个页面。focus 已经移除的节点，浏览器会静默失败，焦点还是不知道去哪。只设 role="dialog" 和 aria-modal="true" 不会自动限制焦点，语义和交互是两回事。自动连带打开另一个弹窗是打断式的错误补偿。',
        },
      },
      {
        type: 'choice',
        chain: 'platform-images',
        q: '使用带 w 描述符的 srcset 时，sizes="320px" 直接决定了什么？',
        options: [
          '图像 CSS 宽度固定为 320px',
          '实际下载文件一定是 320 像素',
          '浏览器必须忽略设备像素比',
          '资源选择所参考的预期布局槽位宽度',
        ],
        answer: 3,
        explain:
          'sizes="320px" 声明用于选图的预期槽位为 320 CSS px；实际显示宽度仍由 CSS 和元素约束决定。浏览器结合 DPR、候选固有宽度等选择文件，例如 DPR=2 时通常需要接近 640 像素候选。用 currentSrc、实际布局宽度和网络面板核对，不应断言一定下载 320 像素文件。',
        detail: {
          example:
            '手机卡片宽 320 CSS px，却下载了 2400 像素的封面。sizes 说的是“我准备给这张图多大的槽位”，浏览器再结合设备像素比和候选固有宽度来挑文件：槽位 320、DPR=2 时通常会选接近 640 的候选，而不是 2400 那张。用 currentSrc 和网络面板能看到实际选了哪个，用布局宽度能看到实际显示多宽，两者别混。',
          code:
            '<img src="cover-640.jpg"\n     srcset="cover-320.jpg 320w, cover-640.jpg 640w, cover-960.jpg 960w"\n     sizes="(max-width: 352px) calc(100vw - 32px), 320px"\n     width="640" height="400" alt="文档封面"\n     style="display:block; width:320px; max-width:100%; height:auto">',
          pitfalls:
            'sizes 不负责设置 CSS 宽度，它只影响选图，这是最常见的误读。srcset 里的 w 必须和文件真实像素宽度一致，写错了浏览器就会挑错。以为浏览器一定下载 320 像素的文件也不对，DPR 和候选质量都在参与决策。不加 width/height 会导致图片晚到时把正文顶下去。',
        },
      },
      {
        type: 'truefalse',
        chain: 'platform-idb',
        q: '同一 IndexedDB 事务中第一条写请求触发 success，就可以确认三条写入全部持久保存成功。',
        answer: false,
        explain:
          '错误。单条请求 success 只说明该请求成功；后续写失败仍可能令整个事务 abort，前面的写入也回滚。批量保存成功应在 transaction.complete 后确认，并处理 abort/error。事务完成与断电时数据一定已刷到物理介质也不是同一保证，需按浏览器与 durability 约定区分。',
        detail: {
          example:
            '一个 readwrite 事务里写三条草稿，第一条 onsuccess 时就提示“保存成功”，结果第二条失败、整个事务 abort，三条一起回滚，用户却发现提示是成功的。保存成功必须绑在事务完成上，同时监听 abort 和 error。另外创建事务后先 await 一个 fetch 再用它，事务可能已经空闲自动提交，直接报 TransactionInactiveError。',
          code:
            'const tx = db.transaction([\'drafts\'], \'readwrite\');\ntx.objectStore(\'drafts\').put(a);\ntx.objectStore(\'drafts\').put(b);\ntx.objectStore(\'drafts\').put(c);\n\ntx.oncomplete = () => reportSaved();      // 这里才算成功\ntx.onabort = () => reportFailed(tx.error);',
          pitfalls:
            '把单条请求的 success 当整批成功，是这里最典型的错误。在事务里 await 任意异步工作，事务会因空闲自动提交。旧标签页占着连接会让数据库升级一直 blocked，界面永远停在初始化中。事务 complete 不等于已经刷到物理介质，这两层保证要分开说。',
        },
      },
      {
        type: 'choice',
        chain: 'platform-bisect',
        q: 'git bisect 的候选提交因不可恢复的旧环境问题无法测试目标缺陷，应该如何标记？',
        options: [
          '直接标记 bad',
          '标记 skip，并说明最终可能保留多个候选',
          '直接标记 good',
          '改写已提交历史让测试通过',
        ],
        answer: 1,
        explain:
          '执行 git bisect skip，表示该提交无法判断目标缺陷。good 表示已经验证目标行为正常，bad 表示已经复现目标缺陷，二者都不能由构建环境失败推导。若关键区间存在多个 skip，最终可能只能得到候选集合；恢复可运行环境后继续缩小，避免把候选说成已确认根因。',
        detail: {
          example:
            '六十次提交里找哪次引入白屏，二分到某个提交时发现它依赖旧工具链、今天根本构建不起来。这时既不能标 good（没验证过白屏是否存在），也不能标 bad（这只是环境问题）。正确做法是 git bisect skip。如果关键区间跳过了好几个，最后可能只给出一组候选，而不是单一定位结果。',
          code:
            'git bisect start\ngit bisect bad HEAD\ngit bisect good v1.4.0\ngit bisect skip          # 该提交无法判断\ngit bisect run ./check.sh   # 脚本：0=good, 1-127=bad, 125=skip, 其他=中止',
          pitfalls:
            '把构建失败标成 bad，会把定位引向完全错误的提交。标 good 更糟，等于宣称没测的那个提交是好的。bisect run 里命令不存在返回 127，会被当成 bad，环境故障必须显式映射成 125 或中止。定位到某次合并也只提供线索，还要看具体差异和触发条件才能算根因。',
        },
      },
      {
        type: 'text',
        chain: 'platform-sourcemap',
        q: '错误平台已经收到 source map，但还原的文件行号明显错误。请给出两项具体核对。',
        explain:
          '第一，核对错误事件的资源 URL、release/build ID、行列号与上传的 JavaScript 及 map 是否属于同一次构建，排除客户端旧缓存与同名覆盖。第二，核对 map 生成后是否又经过压缩、拼接或 CDN 改写，产物一旦变化旧映射就不匹配。用最终线上产物触发已知源码位置的受控异常，验证还原的文件、行列与版本都正确。',
        detail: {
          example:
            '线上报 app.min.js:1:28491，平台还原出来的行号却明显离谱。第一项核对：这条错误所属的 release/build ID，和上传的 JS、map 是不是同一次构建——旧标签页缓存了旧文件、或者同名文件被覆盖都会错配。第二项核对：map 生成之后产物有没有再被压缩、拼接或 CDN 改写，产物一变旧映射就失效。',
          pitfalls:
            '拿本地最新代码重新构建一份 map 去对线上位置，几乎必然对不上，位置随提交、依赖和压缩结果一起变。以为上传成功就等于匹配成功，其实版本索引错了照样还原错误。禁止浏览器下载 map 不影响内部平台按权限使用它，但要让自己的上传链路带上正确的版本标识。只在开发环境验证过不算数，要用最终线上产物触发一次已知位置的受控异常。',
        },
      },
    ],
  });
}
