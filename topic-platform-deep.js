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
          '用 repeat(auto-fit, minmax(..., 1fr)) 等规则让可容纳列数随容器变化。最小值需要兼顾窄屏，若比容器还宽会溢出；先确定产品接受的最小宽度和降列条件。',
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
          'target 指向事件起点，currentTarget 是当前监听所在容器。可从 Element 类型的 target 向上 closest 查找带动作标识的按钮，再确认它属于当前列表的操作范围，读取稳定资源 ID。',
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
          '宽度描述符的 srcset 列出候选资源及其固有宽度，sizes 告诉浏览器不同条件下图像预期占用的布局宽度。浏览器再结合像素密度等因素选择候选，sizes 要与真实 CSS 布局一致。',
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
          '子元素的层级在所在上下文内部比较。先确认祖先上下文如何参与外层排序，再决定整体层级或浮层容器。',
      },
      {
        type: 'choice',
        chain: 'platform-grid',
        q: '宽容器里只有一张卡片，产品希望为后面的卡片保留空列槽位，应优先验证哪个重复轨道设置？',
        options: ['auto-fill', 'auto-fit', '所有项目设 position:absolute', '给唯一卡片设置 flex-grow:1'],
        answer: 0,
        explain:
          'auto-fill 保留按规则生成的空轨道；auto-fit 会折叠空轨道，常让现有项目获得更多空间。实际列宽仍取决于轨道尺寸规则。',
      },
      {
        type: 'truefalse',
        chain: 'platform-delegation',
        q: '点击按钮图标时调用 preventDefault，会自动阻止该 click 事件传播到列表容器。',
        answer: false,
        explain: '取消默认动作与停止传播是不同操作。委托逻辑应识别有效操作区域，按需要处理冒泡。',
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
        explain: '恢复位置应让键盘用户继续原工作流。通常回到触发元素，触发元素消失时需要可预测的替代目标。',
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
        explain: 'sizes 提供资源选择提示；实际布局由 CSS 等决定，浏览器还会结合设备和候选资源作选择。',
      },
      {
        type: 'truefalse',
        chain: 'platform-idb',
        q: '同一 IndexedDB 事务中第一条写请求触发 success，就可以确认三条写入全部持久保存成功。',
        answer: false,
        explain: '请求成功与事务完成不同。后续失败可能中止事务，应以事务完成事件作为这次批量保存成功的依据。',
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
        explain: '无法测试与目标缺陷发生不同。skip 保留这种不确定性，避免把环境问题错误当成回归证据。',
      },
      {
        type: 'text',
        chain: 'platform-sourcemap',
        q: '错误平台已经收到 source map，但还原的文件行号明显错误。请给出两项具体核对。',
        explain:
          '核对事件中的资源 URL、构建版本及行列号，是否与上传映射的那次构建一致；再核对流水线的重建、压缩或 CDN 转换是否改变产物。用最终线上构建触发已知位置的受控异常验证。',
      },
    ],
  });
}
