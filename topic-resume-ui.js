'use strict';
{
  const group = 'resume-ui';
  const cases = [
    {
      id: 'resume-recycle-bin',
      title: '恢复回收站文件时，原目录已删除且出现同名文件',
      source: [
        'Microsoft Graph · restore 的父位置与名称参数（设计参考）',
        'https://learn.microsoft.com/en-us/graph/api/driveitem-restore?view=graph-rest-1.0',
      ],
      check: '能定义软删除与恢复的状态转换，处理目标冲突、并发操作和旧分享链接。',
      steps: [
        [
          '文档平台有回收站。用户删除文件后只从前端列表移除，但原下载链接仍可打开，后端模型遗漏了什么？',
          '需要持久化资源的删除状态、删除时间及必要的恢复信息，并让列表、预览、下载和分享入口按同一资源状态判断可用性。软删除保留可恢复记录与文件内容，永久删除另有清理流程；前端列表状态不能代替后端资源状态。',
        ],
        [
          '恢复时原父目录已删除，而用户选择的新目录已有同名文件，怎么决定恢复位置和名称？',
          '明确产品契约：要求先恢复父目录，或让用户选择有权限的有效目标；同名时可提示重命名或按明确规则生成名称，不能静默覆盖。服务端重新核对目标目录存在、可写和命名约束。公开存储 API 的父位置与名称参数可作设计参考，真实项目规则应以实际实现说明。',
        ],
        [
          'A 正在恢复，B 同时永久删除；两个人也可能同时恢复为同一个名称。只在操作前查一次状态够吗？',
          '检查与最终提交需要同一并发约束，例如基于资源状态、版本的条件更新，并由存储层约束目标下的有效名称冲突。文件已进入不可恢复的清理阶段时不能假装恢复成功；重试应返回已完成结果或明确冲突，避免重复创建目录项。',
        ],
        [
          '文件恢复后，删除前分享出去的链接是否自动恢复？怎样验收这个边界？',
          '先定义分享策略，通常可选择旧分享继续失效、由有权用户显式重新分享；若产品要求恢复旧链接，也必须重新核对当前授权和资源版本。用删除期间访问、恢复后访问、原父目录不存在、同名冲突及并发清理做回归，检查链接入口与目录入口结果一致。',
        ],
      ],
    },
    {
      id: 'resume-search-index',
      title: '全局搜索仍命中已改名或删除的文件',
      source: [
        'Elasticsearch · 搜索可见性与 refresh（机制示例）',
        'https://www.elastic.co/docs/manage-data/data-store/near-real-time-search',
      ],
      check: '能区分权威数据与搜索投影，解释索引滞后下的分页、计数和追平验证。',
      steps: [
        [
          '文件改名已返回成功，但全局搜索还出现旧名称。如果系统维护独立搜索索引，需要分开看哪些完成时间？',
          '区分权威数据库提交、变更投递、索引处理和对查询可见四个边界。索引更新成功也未必立即可搜索，例如 Elasticsearch 的 refresh 机制；这里只用它说明一种机制，不推断项目实际用了 ES。数据库直接检索则应检查查询与缓存路径。',
        ],
        [
          '旧索引返回了已删除文档或旧标题，服务端直接把命中内容发给浏览器有什么问题？',
          '索引是派生视图，可能滞后于删除、改名及权限变化。按稳定资源 ID 批量读取当前权威状态与所需字段，剔除已删除或无权项，再生成可展示结果；同步索引时用资源版本或有序变更避免迟到旧事件覆盖新记录、让已删除文件重新出现。',
        ],
        [
          '索引返回 20 项，回查后只有 13 项有效，能直接显示“总共命中 1000 项”，或把总数减 7 吗？',
          '不能由这一页推算全局可见总数。明确总数是可见精确值、估计值还是仅提供还有更多；分页游标绑定查询条件与稳定排序，必要时在扫描预算内继续取候选补页。若采用索引快照保持分页一致，资源状态与授权仍需按当前规则复核，不能泄露不可见项计数。',
        ],
        [
          '怎样证明索引最终追上数据，而不只是“等两秒再搜一次”？',
          '准备带版本的固定数据，依次执行改名、删除和恢复，控制变更乱序、重复投递与消费失败。记录消费进度和搜索可见延迟，断言旧事件不能复活旧版本；失败进入可观察的补偿流程。按约定时限比对权威记录与搜索结果，并验证跨页无重复、无越权展示。',
        ],
      ],
    },
    {
      id: 'resume-redux',
      title: '文件改名后详情更新了，搜索列表却还是旧名字',
      source: [
        'Redux · Normalizing State Shape',
        'https://redux.js.org/usage/structuring-reducers/normalizing-state-shape',
      ],
      check: '能画出实体、列表顺序和编辑草稿的状态结构，并说明 selector 的引用变化。',
      steps: [
        [
          '同一文件同时出现在目录、搜索结果和详情里，Redux 各存了一份对象。改名后有一处没更新，怎样调整状态模型？',
          "将共享文件按 ID 归一化，目录与搜索保存各自 ID 顺序、查询和分页，详情只保存 selectedId；三处都从 entities 读取当前已提交版本。编辑草稿按 ID 单独放，不能每个输入键都覆盖已提交实体。例如下面的 f1 改名只更新 filesById.f1.name，三个展示入口就读取同一份名称。还需用服务器版本拒绝迟到旧响应，归一化本身不解决请求乱序。↵const state = {↵  filesById: { f1: { id: 'f1', name: '合同', version: 3 } },↵  directory: { ids: ['f1'], cursor: null },↵  search: { query: '合同', ids: ['f1'], cursor: null },↵  selectedId: 'f1',↵  draftsById: { f1: { baseVersion: 3, name: '合同草稿' } }↵};",
        ],
        [
          '把列表 selector 写成 ids.map(id => entities[id])，为什么不相关的通知更新也可能让列表重渲染？',
          '每次执行都会返回新数组，React-Redux 默认按引用比较选择结果。可对真正的派生计算使用记忆化 selector，输入只取所依赖的 ids 与 entities；列表也可传 ID 给行组件，由各行订阅对应实体。先记录提交次数再选择优化方式。',
        ],
        [
          '只要使用记忆化 selector，更新一个文件就保证其他所有行完全不渲染吗？',
          '不能保证。整个 entities 引用变化可能触发列表派生重新计算，父组件传入的新对象或回调也会影响行。检查订阅粒度、稳定引用和组件边界；简单按 ID 直接取值通常无需再包一层昂贵缓存。',
        ],
        [
          '怎样证明状态设计既避免显示不一致，又没有破坏草稿？',
          '同一文件同时出现在三处时改名，断言已提交名称一致、列表顺序不变；再保留一份未提交草稿，模拟服务端更新，验证按约定提示冲突或保留草稿。另发送不相关动作，采集组件提交次数与 selector 重算次数。',
        ],
      ],
    },
    {
      id: 'resume-editor',
      title: 'wangEditor 切换文档后，迟到回显覆盖了正在输入的正文',
      source: ['wangEditor v5 · Vue 与 React 集成', 'https://www.wangeditor.com/v5/for-frame.html'],
      check: '能区分编辑器实例与正文状态，定义初始化回显、用户编辑和销毁的边界。',
      steps: [
        [
          '打开文档 A 后立即切到 B，A 的请求最后返回。如何让 wangEditor 只显示当前文档，并保留 B 的未保存输入？',
          '为加载绑定文档 ID 与请求代际，只有当前请求可提交内容；同时区分初始化回显与用户已修改的正文。若允许加载期间编辑，需要明确合并或确认覆盖策略。只校验文档 ID 还不能处理同一文档的多次加载与编辑竞争。',
        ],
        [
          'onChange 先更新状态，另一个 effect 每次又调用 setHtml 写回相同正文，会有什么隐患？',
          '外部全量写回可能反复触发变更，影响选择区或撤销历史。按所用框架适配器维护一条内容数据流，只在明确的外部文档切换或版本载入时写入，避免将每次用户输入再当成外部重置。具体行为应按编辑器版本验证。',
        ],
        [
          '把 editor 实例和正文一起深度响应化，关闭弹窗时只移除 DOM，为什么可能出问题？',
          '实例属于命令式资源，应和可序列化正文分开。wangEditor v5 的 Vue3 示例使用 shallowRef 保存实例；React 集成也需要在清理时调用 destroy。仅移除容器不能替代编辑器销毁，上传回调与应用自行注册的监听也要失效或清理。',
        ],
        [
          '验收“编辑与回显”时，除保存后文字相同，还会检查什么？',
          '覆盖文档快速切换、迟到响应、带图片与列表的往返保存、未保存关闭确认以及反复打开关闭。检查光标、撤销、事件数量和实例释放；保存格式转换与内容安全沿用各自独立契约。',
        ],
      ],
    },
    {
      id: 'resume-formdata',
      title: '切换商户类型后，隐藏字段和旧校验结果仍被提交',
      source: [
        'MDN · Using FormData Objects',
        'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects',
      ],
      check: '能从有效业务字段构造提交快照，处理异步校验竞态和 multipart 编码边界。',
      steps: [
        [
          '审批表单切换服务商与普通商户后，必填项、确认信息和字段显示都变化。怎样防止旧字段混入新申请？',
          '按当前业务类型定义有效字段和跨字段约束，明确切换时哪些字段清空、保留为草稿或排除出请求。提交时从同一份当前表单快照校验并构造 DTO；隐藏控件不等于自动从状态或请求里删除。内部平台 API 需按项目实际说明。',
        ],
        [
          '商户 A 的异步资格检查晚于商户 B 返回，页面显示 B 却错误提示 A 无资格，如何处理？',
          '校验请求应关联被校验字段、相关依赖值和校验代际，只接纳当前快照的结果。取消旧请求可以减少工作，但提交保护仍需存在；提交时确认当前快照所需的校验已完成，服务端再次核验业务条件。',
        ],
        [
          '用 fetch 提交 FormData 时，手工设置 multipart/form-data，却被后端报解析失败，为什么？',
          "multipart 的 Content-Type 必须带与请求体一致的 boundary；只写 multipart/form-data 会丢失这个分隔信息。fetch 的 body 直接传 FormData 时，删掉手工设置的该头，让浏览器配对生成。普通值会被转成字符串；文件用 File/Blob；对象或数组需按后端契约转 JSON 或重复字段。以下约定 metadata 是 JSON 字符串、attachment 是文件，接口返回 JSON。↵async function submit(form, file) {↵  const dto = { merchantId: form.merchantId, type: form.type };↵  if (form.type === 'serviceProvider') dto.serviceProviderId = form.serviceProviderId;↵  const body = new FormData();↵  body.append('metadata', JSON.stringify(dto));↵  if (file) body.append('attachment', file, file.name);↵  const r = await fetch('/api/applications', { method: 'POST', body });↵  if (!r.ok) throw new Error('HTTP ' + r.status);↵  return r.json();↵}",
        ],
        [
          '怎样测试批量商户输入与附件提交，避免只检查按钮能点？',
          '覆盖重复 ID、空行、非法 ID、不同换行符、类型切换及校验乱序，核对最终 DTO 和错误对应行。检查 multipart 字段、附件名与实际字节、后端解析结果；失败重试时确认提交语义与去重规则，不能只断言请求返回 200。',
        ],
      ],
    },
    {
      id: 'resume-uni-render',
      title: 'uni-app 的 H5 页面流畅，编译成小程序后拖动卡顿',
      source: ['uni-app · 性能优化与运行原理', 'https://uniapp.dcloud.net.cn/tutorial/performance.html'],
      check: '能区分计算、跨层通信与渲染成本，并按目标端选择可验证的优化。',
      steps: [
        [
          '同一列表在 H5 正常，小程序中每次拖动都更新整份列表并明显卡顿。除了 JS 算法，还应检查什么？',
          '先确认目标端、渲染模式和版本。小程序存在逻辑层到视图层的数据更新成本，检查提交频率、载荷大小、更新范围和渲染节点数。H5 的表现不能代替真机证据；uni-app 的自动差量更新也不意味着任意大数据高频变更都没有代价。',
        ],
        [
          '原生小程序组件每次 setData 都发送全部行，怎样缩小成本，同时不丢最后一次拖动状态？',
          '将展示所需数据与仅计算使用的数据分开，更新真正变化的路径，合并中间高频更新并确保结束事件提交最终值。uni-app 的 Vue 组件通过响应式状态交给框架处理，不能把原生组件的手工 setData 方案无差别搬进所有端。',
        ],
        [
          '把桌面拖拽库直接搬到小程序，库里访问 window 和 document，为什么构建通过仍可能运行失败？',
          'JS 语法可编译不等于宿主 DOM API 存在。将领域规则与平台交互分开，优先使用目标端支持的拖动组件或适配实现；renderjs、WXS 等方案各有端与版本范围，必须核实后选择，不能假定一份 DOM 代码通用。',
        ],
        [
          '面试官追问“优化后好了多少”，你会怎样取证？',
          '固定数据量、设备与交互脚本，分别记录首开、拖动响应、一次更新的数量和大小，以及结束后状态是否正确。覆盖低端真机、持续拖动与切页返回，对比 H5 和目标小程序；只使用自己的实测结果说明改善。',
        ],
      ],
    },
    {
      id: 'resume-chart-events',
      title: '驾驶舱点击一张图，另外三张图不断重复刷新',
      source: ['Apache ECharts · Event and Action', 'https://echarts.apache.org/handbook/en/concepts/event/'],
      check: '能把图表事件转换为稳定的业务筛选，阻断回显回环并测试联动请求数量。',
      steps: [
        [
          '图表 A 点击后改变全局筛选，B 用 dispatchAction 回显选中状态，其事件又改回全局筛选。怎样定位重复刷新？',
          '按一次操作记录事件来源、业务筛选版本和请求链，确认程序动作是否再次触发订阅回调。让用户意图先更新统一筛选，再由视图反映状态；对相同业务筛选做幂等处理，区分用户变更与程序回显，避免多个图表互相充当状态源。',
        ],
        [
          '图表排序后仍使用 dataIndex 作为后台筛选条件，为什么可能查询错项目？',
          'dataIndex 是当前图表数据中的位置，排序、过滤或数据转换后不等于业务主键。保留稳定项目 ID 与维度标识，将事件中的数据映射为业务条件，不能把显示标签或数组下标当成永远稳定的标识。',
        ],
        [
          '修改配置时反复绑定 chart.on，后来点击一次发出五次请求，如何修复？',
          "将监听绑定到图表实例生命周期，而不是每次 setOption 后重新 on。保留同一个 handler 引用，重新绑定前或卸载时用 off(event, handler) 移除自己注册的监听；不能为了去重无差别清掉别的模块监听。处理器通过函数读取当前配置，避免抓住旧映射。以下示例约定每个柱子的 data 含 businessId，updateFilter 自身按业务值幂等。↵function bindChart(chart, getCurrentConfig, updateFilter) {↵  function onClick(params) {↵    const id = params.data?.businessId;↵    if (id == null) return;↵    updateFilter({ field: getCurrentConfig().field, id });↵  }↵  chart.on('click', onClick);↵  return () => chart.off('click', onClick);↵}",
        ],
        [
          '联动配置可以保存并回显，怎样设计一次有说服力的回归？',
          '用固定项目 ID 的样例先点击筛选，再排序、切换图表类型、保存并重新打开。核对筛选语义、选中状态和请求次数；重复回显同一配置不应增加监听或产生无界刷新，失效字段应有明确提示。',
        ],
      ],
    },
    {
      id: 'resume-player-sdk',
      title: '教学视频和监控画面切换多次后，播放器资源一直增加',
      source: ['Video.js · Player Workflows', 'https://legacy.videojs.org/guides/player-workflows/'],
      check: '能画出播放器适配器的生命周期，说明监控授权与 SDK 实例清理的责任边界。',
      steps: [
        [
          '同一弹窗展示 video.js 教学视频或监控 SDK 画面，切换时只替换容器 HTML，为什么可能残留声音与连接？',
          '只替换 DOM 不会自动执行 SDK 的释放流程，旧播放器可能仍持有定时器、事件、连接或媒体资源。以 Video.js 8 的生命周期为例，先调用 player.dispose()，再清理应用自建的订阅和当前实例引用；监控 SDK 按实际版本的销毁接口处理。把 create、setSource、pause、dispose 适配成统一领域接口，并明确实例归属，切换时先释放再创建。Video.js 不同大版本的 API 不能靠名字类推。',
        ],
        [
          '监控 SDK 尚在加载，用户关闭弹窗后又打开另一台设备，旧初始化完成时该怎么处理？',
          '每次打开或关闭都推进代际，初始化完成时对比代际；不是当前所有者的实例立即 dispose，不能挂进新画面。下面约定 create 返回统一适配实例，dispose 可重复调用且会释放全部 SDK 资源。真实组件还应把容器所有权与设备 ID 绑定，并由 UI 接住 open 抛出的当前错误。↵function createPlayerSlot(create) {↵  let generation = 0, current = null;↵  function close() {↵    generation++;↵    current?.dispose();↵    current = null;↵  }↵  return {↵    close,↵    async open(device) {↵      close();↵      const mine = generation;↵      let player;↵      try { player = await create(device); }↵      catch (e) { if (mine === generation) throw e; return; }↵      if (mine !== generation) { player.dispose(); return; }↵      current = player;↵    }↵  };↵}',
        ],
        [
          '监控播放凭据过期时，能把长期密钥放进前端并无限重试刷新吗？',
          '长期密钥由服务端保管，服务端校验用户与设备权限后按供应商契约提供必要的播放凭据。前端区分到期、无权限和设备离线，限制重试与重复刷新；撤权后终止播放。凭据格式与续期接口需依据实际 SDK 文档，不能凭空套用。',
        ],
        [
          '怎样验证统一展示组件，而不只确认两个画面都出现过？',
          '反复切换视频与设备、在初始化中途关闭、模拟凭据到期与撤权，再检查活动实例、连接、事件和声音数量。若需保留教学视频进度，独立保存业务进度；不能通过保留失去所有权的播放器实例实现。',
        ],
      ],
    },
  ];
  PRACTICE_BANK.groups.push({id: group, name: '简历专项：前端交付与跨端集成', cards: cases.map((c) => c.id)});
  for (const c of cases) PRACTICE_BANK.cards[c.id] = {...c, group};
  TOPIC_LEVELS.push({
    id: 29,
    name: '简历前端深挖',
    desc: '文件管理、状态、编辑器、跨端和驾驶舱',
    difficulty: 'hard',
    icon: '🧩',
    questions: [
      {
        type: 'choice',
        chain: 'resume-recycle-bin',
        q: '回收站恢复时原目录已删除、目标目录同名冲突，应怎样处理？',
        options: [
          '静默覆盖现有文件',
          '只改前端列表',
          '根据恢复策略选择有效目标与名称，服务端校验当前权限并条件提交',
          '跳过版本检查强行恢复',
        ],
        answer: 2,
        explain:
          '先确认资源仍可恢复，再按产品策略要求恢复原父目录或选择有写权限的新目录；同名时明确提示改名或生成新名称，不能静默覆盖。服务端在提交时重新核对资源版本、删除状态、目标权限和名称约束，防止预检查后发生并发永久删除或同名恢复。成功后以服务端最终位置与名称更新界面。',
        detail: {
          example:
            '用户从回收站恢复一份文件，可原目录已经被删了，选中的新目录里又正好有同名文件。静默覆盖会直接毁掉现有那份；只改前端列表，后端根本没恢复。正确顺序是：确认资源仍处于可恢复状态，按产品规则要求先恢复父目录或让用户选一个有写权限的目标；同名时提示改名或按规则生成新名称。服务端在提交那一刻重新核对版本、删除状态、目标权限和命名约束——因为预检查之后，别人可能已经永久删除了它。',
          pitfalls:
            '静默覆盖是最危险的默认行为。只在操作前查一次状态，中间别人把文件永久删了，恢复就会“成功”得莫名其妙。文件已被清理到不可恢复阶段，不能假装恢复成功。旧分享链接是否随恢复继续有效是独立的产品决策，需要重新核对授权。',
        },
      },
      {
        type: 'truefalse',
        chain: 'resume-search-index',
        q: '搜索索引返回一页 20 项，回查后有 7 项已删除，直接把索引总数减 7 就得到可见文档总数。',
        answer: false,
        explain:
          '错误。这一页失效 7 项不代表其他页没有失效项，不能用索引总数减 7 推出当前用户可见总数。必须区分索引命中数、经权限和删除状态过滤的可见数以及估算值。可在扫描预算内继续取候选补页，并使用明确的游标与排序契约；无法给精确总数时显示还有更多，不能泄露不可见资源的计数。',
        detail: {
          example:
            '搜索返回一页 20 项，回查后 7 项已删除，剩 13 项能显示。这时候把索引总数 1000 减 7 得出 993，是错的——其他页同样可能有失效项，而且权限过滤的丢失量根本没法从这一页推算。要分开三个数：索引命中数、过滤后的可见数、以及估算值。给不出精确总数就显示“还有更多”，别把不可见资源的数量泄露出去。',
          pitfalls:
            '用一页的失效率去推全局，是这里最典型的错误。把索引当作权威数据源，其实它是派生视图，改名、删除、权限变更都可能滞后。用总数减失效数，还可能泄露用户本来无权看到的资源规模。分页游标没有绑定查询条件和稳定排序，翻页会出现重复或遗漏。',
        },
      },
      {
        type: 'choice',
        chain: 'resume-redux',
        q: '文件实体归一化后，selector 每次都 map 出新数组，不相关动作仍可能让列表更新。应先检查什么？',
        options: [
          'Redux 是否需要整体重装',
          '选择结果的引用、依赖范围及组件订阅粒度',
          '是否把所有状态改为全局变量',
          '是否删除列表的 key',
        ],
        answer: 1,
        explain:
          'React-Redux 默认比较 selector 结果引用，ids.map 每次生成新数组，即使内容未变也可能触发更新。先检查 ids/entities 输入是否稳定，再用记忆化 selector 或让列表只订阅 IDs、每行按 ID 订阅实体。归一化解决副本一致性，不自动保证无重渲染；用无关动作前后的提交次数验证优化。',
        detail: {
          example:
            '文件改了个名，详情更新了，搜索列表却还是旧名字——因为同一个文件在目录、搜索结果、详情里各存了一份对象，有一处没跟上。先按 ID 归一化：filesById 只存一份，目录和搜索只存各自的 ID 顺序，详情只存 selectedId，三处都从 entities 读。改完名只更新 filesById.f1.name，三个入口就自动一致了。但归一化不解决重渲染：ids.map 每次返回新数组，React-Redux 按引用比较，内容没变也可能触发更新。',
          code:
            'const ids = state.directory.ids;\n// 每次都是新数组 → 引用变化 → 可能重渲染\nconst rows = ids.map((id) => state.filesById[id]);\n\n// 方案一：记忆化，输入只取真正依赖的\nconst rows = useSelector(selectDirectoryRows);   // 内部 createSelector\n\n// 方案二：列表只传 ID，每行自己订阅实体\n// <Row id={id} />  → useSelector(s => s.filesById[id])',
          pitfalls:
            '以为归一化就等于优化了渲染，是这里的关键误区，它只解决数据一致性。整个 entities 引用一变，记忆化 selector 也会重算。只给列表加 memo 却传入新对象或新回调，照样重渲染。草稿如果直接覆盖已提交实体，归一化后会让所有入口都显示未保存内容。',
        },
      },
      {
        type: 'choice',
        chain: 'resume-editor',
        q: 'wangEditor 的 onChange 更新状态后，再在每次状态变化时全量 setHtml，最应警惕什么？',
        options: [
          '浏览器必然禁止输入',
          '所有字体都会丢失',
          '内容回写循环及选择区、撤销状态受影响',
          '编辑器会自动保存到数据库',
        ],
        answer: 2,
        explain:
          'onChange→更新状态→setHtml 的回路可能把用户每次输入重新解释为外部文档载入，造成重复变更、选择区跳动或撤销历史受影响。保持编辑器到正文状态的一条数据流，只在文档切换或明确外部版本到达时回写内容；必要时比较版本与内容，避免同值重置。具体回调与历史行为按所用 wangEditor 版本验证。',
        detail: {
          example:
            'onChange 把内容写进状态，另一个 effect 监听到状态变化又调用 setHtml 写回编辑器——用户每敲一个字，都被当成一次“外部文档载入”。结果是光标跳到末尾、撤销历史被冲掉，甚至绕成回写循环。正确的数据流是单向的：编辑器 → 状态，只在切换文档或明确收到外部新版本时才往编辑器里写。',
          code:
            '// 危险：每次状态变化都全量回写\nwatch(body, (v) => editor.setHtml(v));\n\n// 安全：只在文档切换/外部版本到达时写入\nwatch(() => docId.value, async (id) => {\n  const html = await loadDoc(id);\n  editor.setHtml(html);\n});',
          pitfalls:
            '把用户输入再当成外部重置，是这里最典型的回路。写回前不比较版本和内容，同值重置也会打断撤销。把编辑器实例和正文一起深度响应化，会把命令式对象也纳入响应式追踪。只移除容器 DOM 不调用 destroy，编辑器内部监听和上传回调都还活着。具体回调行为要按 wangEditor 版本核实。',
        },
      },
      {
        type: 'truefalse',
        chain: 'resume-formdata',
        q: '直接用 fetch 发送 FormData 时，手工固定 Content-Type 为 multipart/form-data 就足够描述请求体。',
        answer: false,
        explain:
          '错误。multipart 请求头必须包含与请求体分隔符一致的 boundary；只设置 multipart/form-data 会让服务端缺少解析信息。直接用 fetch 的 body 传 FormData 时，应让浏览器生成该头。对象、数组和文件各按接口契约编码，例如 JSON.stringify 元数据、File/Blob 作为附件，并检查服务端实际解析结果。',
        detail: {
          example:
            '用 fetch 发 FormData，却手工把 Content-Type 固定成 multipart/form-data，后端报解析失败。因为 multipart 的请求头必须带上和请求体一致的分隔符 boundary，只写类型等于丢了解析信息。正确做法是直接把 FormData 塞进 body，让浏览器自己生成带 boundary 的头，你不要手写这一行。',
          code:
            'const body = new FormData();\nbody.append(\'metadata\', JSON.stringify(dto));\nif (file) body.append(\'attachment\', file, file.name);\n\n// 正确：不设置 Content-Type，浏览器补 boundary\nawait fetch(\'/api/applications\', { method: \'POST\', body });\n\n// 错误：手工固定后 boundary 丢失\n// headers: { \'Content-Type\': \'multipart/form-data\' }',
          pitfalls:
            '手写 multipart/form-data 是最常见的错误，boundary 是请求体里随机生成的，没法手写对。普通值会被转成字符串，对象和数组必须按后端契约转 JSON 或重复字段，否则后端收到 [object Object]。切换业务类型后隐藏字段还留在状态里一起提交，也是这类表单的常见问题——隐藏控件不等于自动从请求中移除。',
        },
      },
      {
        type: 'choice',
        chain: 'resume-uni-render',
        q: 'uni-app 页面 H5 流畅，小程序拖动卡顿，下一步最有用的检查是什么？',
        options: [
          '只比较 JavaScript 文件行数',
          '把所有数据都变成字符串',
          '只在桌面浏览器看帧率',
          '真机记录跨层更新频率、载荷与节点数，并核对目标端渲染模式',
        ],
        answer: 3,
        explain:
          '在目标小程序真机记录拖动时的跨层更新频率、每次数据大小、变化路径和渲染节点数量，同时核实 uni-app 版本与渲染模式。高频整表更新会放大逻辑层到视图层的传递与渲染成本。将纯计算数据留在非展示状态，合并中间更新、缩小变化范围，结束事件提交最终值；使用同设备同数据对比响应时延与最终位置正确性。',
        detail: {
          example:
            '同一个列表在 H5 里顺滑，编译成小程序后一拖动就卡。小程序有逻辑层到视图层的数据传递成本，每次拖动都更新整份列表，代价会被放大。下一步最有用的不是读 JS 代码，而是在目标真机上记录：提交频率、每次数据大小、更新了哪些路径、渲染了多少节点，再核对 uni-app 版本和渲染模式。把纯计算用的数据留在非展示状态，合并中间更新，拖动结束时才提交最终值。',
          pitfalls:
            '拿 H5 或桌面浏览器的表现代替真机证据，是这类问题最常见的判断错误。以为 uni-app 会自动差量更新就高枕无忧，数据量一大、频率一高照样有代价。把桌面拖拽库直接搬过来，它访问的 window 和 document 在小程序宿主里根本不存在，构建通过但运行时失败。各端优化手段（renderjs、WXS）都有版本和范围限制，不能假定通用。',
        },
      },
      {
        type: 'choice',
        chain: 'resume-chart-events',
        q: 'ECharts 数据排序后，点击第 3 根柱子应提交哪个筛选标识？',
        options: ['该项关联的稳定业务 ID', '永远提交数字 3', 'series 数组长度', '图表容器的 DOM 下标'],
        answer: 0,
        explain:
          '提交该柱子关联的稳定业务 ID。dataIndex 是当前展示数据中的位置，排序、过滤或转换后第 3 项可能已不是原来的项目。数据项保留 businessId 等领域标识，在 click 回调中从 params.data 或明确映射读取，再生成筛选条件；标题和序号都不能代替稳定身份。',
        detail: {
          example:
            '驾驶舱按销售排序后，用户点了第 3 根柱子。如果提交的是 dataIndex=3，排序一变，第 3 根可能已经是另一个项目，筛选结果就错了。数据项里保留 businessId，点击时从 params.data 取这个稳定 ID 再生成筛选条件。顺带一个常见坑：每次 setOption 后重新 chart.on，监听就会累积，点一次发出五次请求。',
          code:
            'function bindChart(chart, getConfig, updateFilter) {\n  function onClick(params) {\n    const id = params.data?.businessId;   // 稳定业务 ID\n    if (id == null) return;\n    updateFilter({ field: getConfig().field, id });\n  }\n  chart.on(\'click\', onClick);\n  return () => chart.off(\'click\', onClick);   // 卸载时移除自己注册的\n}',
          pitfalls:
            '把 dataIndex 或数组下标当作稳定身份，排序、过滤、切换图表类型后必然错位。把显示标签当主键，改名就断。重复绑定 chart.on 而从不 off，监听会越积越多。图表 A 的 dispatchAction 回显又触发订阅改回全局筛选，会形成多张图互相刷新的循环。',
        },
      },
      {
        type: 'truefalse',
        chain: 'resume-player-sdk',
        q: '移除 Video.js 8 播放器的容器 DOM，就等价于完整调用播放器销毁流程。',
        answer: false,
        explain:
          '错误。以 Video.js 8 为例，先调用 player.dispose() 让播放器释放其事件、内部节点和资源，再清理应用自己注册的订阅与实例引用；删除容器 DOM 不等价于该流程。监控 SDK 按其实际版本的销毁 API 处理。快速切换或初始化未完成就关闭时，还要使旧任务失效，释放迟到创建的旧实例。',
        detail: {
          example:
            '教学视频和监控画面在同一个弹窗里来回切换，只替换了容器的 HTML，结果声音还在响、连接还挂着、资源越积越多。因为移除 DOM 不会执行播放器的释放流程。Video.js 要先调 player.dispose()，再清掉自己注册的订阅和实例引用；监控 SDK 有各自的销毁接口。正确做法是把创建、切源、暂停、销毁封装成统一接口，切换时先释放旧的再建新的。',
          code:
            'function createPlayerSlot(create) {\n  let generation = 0, current = null;\n  function close() { generation++; current?.dispose(); current = null; }\n  return {\n    close,\n    async open(device) {\n      close();\n      const mine = generation;\n      let p; try { p = await create(device); } catch (e) { if (mine === generation) throw e; return; }\n      if (mine !== generation) { p.dispose(); return; }  // 迟到实例立即释放\n      current = p;\n    },\n  };\n}',
          pitfalls:
            '以为删掉 DOM 就是销毁，是这里最核心的错误，事件、定时器、连接和媒体资源都还活着。初始化没完成就关闭、之后旧实例才创建成功，不做代际判断就会挂进新画面。为了保住教学视频进度而留着已经没有所有权的播放器实例，是另一种常见错法，进度应该单独存。Video.js 不同大版本的 API 不能靠名字类推。',
        },
      },
    ],
  });
}
