'use strict';
{
  const group = 'resume-data';
  const cases = [
    {
      id: 'rdata-sql-index',
      title: '文件列表有联合索引，为什么仍然扫描几十万行',
      source: ['MySQL · EXPLAIN 与实际执行计划', 'https://dev.mysql.com/doc/refman/8.4/en/explain.html'],
      check: '能针对具体查询提出候选索引，读懂估计与实际行数，并验证收益及写入代价。',
      steps: [
        [
          '把 MySQL 技能放到一个文件目录查询中：WHERE tenant_id=? AND parent_id=? AND deleted=0 ORDER BY created_at DESC,id DESC LIMIT 50。怎样设计第一版索引？',
          '第一版可验证联合索引 (tenant_id,parent_id,deleted,created_at DESC,id DESC)：前三列等值缩小目录范围，后两列匹配分页排序，id 用于相同创建时间的稳定顺序。例如 CREATE INDEX idx_file_list ON files(tenant_id,parent_id,deleted,created_at DESC,id DESC);。全升序后反向扫描也可能满足本题两个字段同向的倒序，应由实际执行计划比较。索引不能只靠“选择性最高列永远放最前”决定，还要考虑其他查询前缀、数据倾斜和写入成本。这里是候选设计，面试讲项目时应给实际表结构、数据量及验证结果。',
        ],
        [
          'EXPLAIN 的 possible_keys 包含这个索引，就能说命中了吗？',
          'possible_keys 是候选，继续看实际选择的 key、访问方式、预计行数、过滤及排序操作。对安全的代表性 SELECT 可用 EXPLAIN ANALYZE 对照实际行数、时间与循环次数；它会执行查询，应在受控数据和负载下运行。',
        ],
        [
          'SELECT 还要返回 name，而 name 不在索引中；用了索引是否就没有额外读取？',
          '使用索引定位与覆盖查询是不同概念。InnoDB 二级索引查询可能还要按主键读取未覆盖列。不要为覆盖所有字段无限加宽索引；对比返回字段、实际回表量、索引大小与查询耗时。',
        ],
        [
          '测试目录只有十条记录，查询都在一毫秒内。如何证明上线后有收益？',
          '准备大小不同、分布倾斜且包含删除数据的目录，固定查询参数和缓存条件，对比扫描量、排序、尾延迟与写入开销。还要验证跨租户过滤和稳定排序，避免只在小样本上比较耗时。',
        ],
      ],
    },
    {
      id: 'rdata-mongo-model',
      title: '把整个目录和所有历史版本塞进一份 MongoDB 文档',
      source: [
        'MongoDB · 嵌入、引用与无界数组',
        'https://www.mongodb.com/docs/manual/data-modeling/design-antipatterns/unbounded-arrays/',
      ],
      check: '能按增长上限和读写边界选择嵌入或引用，解释单文档原子更新的范围。',
      steps: [
        [
          '文档平台把目录下所有文件、各文件所有版本都嵌入父目录的数组。开始很方便，规模增长后有哪些问题？',
          '数组可能无界增长，文档体积、更新竞争和传输成本都会上升，还会受到 BSON 文档大小限制。可以将文件及历史版本独立存储，以目录 ID 和文件 ID 关联；把有明确大小上限、经常一起读取的小块信息保留为嵌入字段。',
        ],
        [
          '文件名与文件的当前版本引用必须一起变化，需要给每次更新开启多文档事务吗？',
          '不需要为同一文档内的一次更新开启多文档事务。把文件名和当前版本引用放在同一个更新操作中；并发编辑时将预期版本纳入过滤，例如 updateOne({_id, tenantId, version: 7}, {$set: {name, currentVersionId}, $inc: {version: 1}})。检查 matchedCount 是否为 1；为 0 时重读并处理版本冲突或对象不存在，不要继续报告保存成功。单次更新原子并不保护此前应用层读取，也不自动校验 currentVersionId 指向的外部文档是否存在。',
        ],
        [
          '若一次操作还要修改另一个配额文档，单文档原子性还够吗？',
          '要先明确两份数据是否必须同时成立。需要跨文档原子性时，在支持的部署上使用事务并处理冲突重试；允许异步汇总时，可另设可重放、可对账的更新流程。数据库事务不会自动包含外部文件存储动作。',
        ],
        [
          '怎样验证拆分后的模型确实适合文件列表和版本历史？',
          '列出按目录分页、按文件查版本、删除与恢复的访问模式，为过滤和排序设计索引，观察 explain 的扫描量。用大量版本、并发改名和配额冲突检查大小、正确性与延迟；说明自己的项目实际采用了哪种模型。',
        ],
      ],
    },
    {
      id: 'rdata-cache-timeline',
      title: '第二次删除已经执行，旧权限为何又出现在 Redis',
      source: [
        'Microsoft · Cache-Aside 一致性边界',
        'https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside',
      ],
      check: '能手推旧读晚写的时间线，解释延迟选择、失败补偿和权限时效要求。',
      steps: [
        [
          '简历写了延迟双删。假定流程为删除缓存、更新数据库、延迟后再删：怎样构造第二次删除后仍回填旧值的执行顺序？',
          '第一次删除后，读请求 R 从数据库读到旧值，但在回填前暂停；写请求提交新值，并完成延迟删除；随后 R 恢复，把手里的旧值放回空缓存。按这条时间线就能说明固定延迟并非一致性证明。',
        ],
        [
          '把延迟从 500 毫秒改为五秒，可以消除这个问题吗？',
          '只能改变部分竞争窗口，无法覆盖任意暂停、慢查询或副本延迟。选择延迟需要真实读耗时分布和业务容忍窗口；权限撤销应另有符合时效要求的权威校验，不能把经验延迟当作立即生效承诺。',
        ],
        [
          '第一次删成功，数据库也提交了，但进程在 setTimeout 执行前重启，怎么办？',
          'setTimeout 随进程重启丢失，需要把失效意图持久化。例如在更新权限的同一个数据库事务中写入一条 outbox 事件，提交后由消费者删除缓存，删除成功再标记处理完成；消费者崩溃后可重试，DEL 本身可重复。这样补上“数据库提交了但没有发出失效任务”的缺口。它仍不能阻止旧读在最终删除后才回填，需结合版本隔离或权威鉴权设计，并监控积压、最大陈旧窗口和长期失败。',
        ],
        [
          '面试官让你证明原方案有效，你会给出什么证据和边界？',
          '用可控闸门暂停旧读，在第二次删除后再释放；另测删除失败、任务丢失和副本旧读。分别报告缓存命中率、数据库负载、陈旧窗口和授权结果。准确说明项目实际做了哪些保障，后续改进单独作为设计方案。',
        ],
      ],
    },
    {
      id: 'rdata-container-config',
      title: '同一前端镜像换了容器环境变量，仍然请求测试地址',
      source: ['Vite · 构建期环境变量', 'https://vite.dev/guide/env-and-mode'],
      check: '能区分构建期常量与运行期配置，说明浏览器公开配置和服务端密钥的归属。',
      steps: [
        [
          'Vite 构建产物放进 Nginx 镜像，启动生产容器时设置 VITE_API_URL，页面却仍请求测试地址。为什么？',
          'import.meta.env 中相应值在构建时进入产物。已生成的浏览器脚本不会自动读取容器进程的环境变量。先检查加载到的构建标识与产物，再明确配置是在构建时替换，还是由页面启动时读取运行期配置。',
        ],
        [
          '希望测试与生产使用同一个不可变镜像，可以怎样提供不同 API 地址？',
          '同一镜像可以在页面启动时先请求 /runtime-config.json，取到并校验 apiBase、configVersion 后再创建 API 客户端；该文件可由启动脚本从允许字段生成，也可由配置端点返回。仅把容器 ENV 设置好，而页面不读取这个文件，仍不会生效。公开配置不能放服务端密钥，生成 JSON 应使用序列化工具以免引号破坏结构。给配置设置明确的缓存策略，加载失败时停止相关请求并提示重试，避免悄悄回落到测试地址；记录镜像和配置版本以便回滚。',
        ],
        [
          '把密钥放在 VITE_ 变量中，或通过 Docker ARG 传给构建，能保证不会暴露吗？',
          '进入浏览器产物的配置可被用户读取，服务端密钥应留在服务端。Docker ARG、ENV 也不能当作构建秘密的安全通道，值可能进入产物、镜像历史或元数据；构建访问私有依赖时使用专门的 secret mount，并防止工具把秘密写入输出。',
        ],
        [
          '这项配置改造的发布验收应检查哪些结果？',
          '在同一镜像下分别注入两套公开配置，确认请求目标、版本标识和失败提示正确；检查静态产物与日志未包含服务端凭证。再验证旧页面缓存配置、配置缺失和回滚时的兼容性，记录实际采用的配置加载顺序。',
        ],
      ],
    },
    {
      id: 'rdata-proxy-path',
      title: 'Nginx 代理加了一个斜杠，API 全部变成 404',
      source: [
        'Nginx · proxy_pass 与 proxy_read_timeout',
        'https://nginx.org/en/docs/http/ngx_http_proxy_module.html',
      ],
      check: '能在明确配置条件下算出上游 URI，并区分代理空闲超时与业务总超时。',
      steps: [
        [
          '普通前缀 location /api/ 下，没有 rewrite 或变量。proxy_pass http://backend; 与 proxy_pass http://backend/; 对 /api/files 的上游路径有何区别？',
          '前者不带 URI，通常保留 /api/files；后者带 URI /，用它替换匹配的 /api/ 前缀，得到 /files。必须连同 location、rewrite 与变量配置一起分析，不能只背斜杠口诀。',
        ],
        [
          '用户看到 404，是前端路由、Nginx 还是 Node 返回的，怎样最快区分？',
          '对齐同一请求的访问日志、上游状态和请求标识，核对代理前后路径。用只返回接收到的 URI 的测试上游验证映射；分别测 API、静态资源和前端深层路由，避免 SPA 回退把 API 错误变成 HTML 200。',
        ],
        [
          'proxy_read_timeout 设为 60s，能断言一个请求总共最多执行 60 秒吗？',
          '不能。它约束从上游两次读取之间的等待时间，持续有数据的响应可超过这个总时长。业务总截止时间、客户端取消和服务端任务中止需单独设计，并确认经过各层代理后的实际行为。',
        ],
        [
          '怎样把这项改动加入 GitLab CI 和发布验证？',
          '先做 nginx -t 配置检查，再针对真实 location 用代表性请求核对上游 URI、状态与内容类型。验证携带查询参数、接口错误和前端刷新路径；发布后检查实际加载的配置版本及关键业务请求，语法通过不能替代路径验收。',
        ],
      ],
    },
    {
      id: 'rdata-pm2-state',
      title: 'PM2 从一个进程扩到四个，登录态和上传进度偶尔消失',
      source: ['PM2 · Cluster Mode 与无状态应用', 'https://pm2.keymetrics.io/docs/usage/cluster-mode/'],
      check: '能识别多进程本地状态和重复定时任务，解释共享持久化及路由粘性的边界。',
      steps: [
        [
          '单进程时正常，cluster 四实例后，同一用户查询上传进度有时查不到。先检查什么？',
          '检查会话、任务进度是否保存在某个进程的内存 Map 或实例专用目录中的文件里。PM2 可让多个进程处理流量，但不会自动把这些数据变成共享状态。记录进程标识与请求关联号，验证缺失是否随请求落点变化。',
        ],
        [
          '把上传进度迁到 Redis 就自动获得永久可靠保存了吗？',
          '还需明确进度的权威来源、写入确认、过期与持久化配置，以及缓存丢失后的恢复方式。可根据已确认分片重新构建进度；Redis 的共享访问与具体部署的故障持久性是不同保证。',
        ],
        [
          '改成粘性会话，或每个进程都启动一次清理定时器，会发生什么？',
          '粘性路由可能减少落到不同实例的情况，但不能保存重启后丢失的状态，也不能替代协议需要的跨实例协调。每实例定时器会重复执行任务；把调度与 Web 实例职责分开，定义抢占、幂等和失败接管规则。',
        ],
        [
          '怎样验证扩容后的行为，而不是只看四个进程都 online？',
          '让同一业务流跨实例执行，过程中退出一个实例，再检查会话、分片状态和最终提交。观察定时任务的有效执行次数，验证扩缩容前后结果一致；同时测共享存储不可用时的明确降级与错误反馈。',
        ],
      ],
    },
    {
      id: 'rdata-sql-transaction',
      title: '配置保存加了事务，为什么仍会覆盖另一个人的修改',
      source: [
        'MySQL · 事务隔离与非锁定读取',
        'https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html',
      ],
      check: '能区分快照、锁定读和版本条件更新，用两连接时间线解释冲突与死锁重试。',
      steps: [
        [
          '两个运营同时读到配置 version=7，各自在事务里修改后无条件保存。使用 InnoDB REPEATABLE READ 就能保证不互相覆盖吗？',
          '不能。两人都读到 version=7，先提交的人写到 8，后提交者若仍无条件 UPDATE，就可能覆盖前者业务意图。可执行 UPDATE configs SET content=?, version=version+1 WHERE tenant_id=? AND id=? AND version=7，并检查受影响行数：1 表示成功，0 表示版本已变或目标不存在，应重读并提示冲突，不能静默改为无条件更新。锁定读则要在短事务内 SELECT ... FOR UPDATE 后基于当前值修改；它不能跨用户编辑数分钟持锁。事务负责提交原子性，版本条件负责识别这次编辑是否基于旧状态。',
        ],
        [
          'READ COMMITTED 与 REPEATABLE READ 的普通 SELECT 有何差异？SELECT FOR UPDATE 又扮演什么角色？',
          '对 InnoDB 的一致性非锁定读，RC 每次读取取得新快照，RR 通常沿用该事务首次一致性读建立的快照；本事务自己的写入另有可见性。FOR UPDATE 是锁定读，在明确事务中为后续修改锁定相关记录。它与普通快照读语义不同，需按查询条件、索引和版本分析锁范围。',
        ],
        [
          '事务 A 先改目录 1 再改目录 2，B 顺序相反，数据库报告死锁。可以只重试最后一条 UPDATE 吗？',
          'InnoDB 选择牺牲事务后会回滚该整个事务，因此要在有上限的退避策略下重试完整业务事务，并重新读取必要状态。统一资源访问顺序、缩短事务并检查索引可减少冲突。锁等待超时默认可能只回滚语句，应按错误码与配置明确回滚范围，不能与死锁混为一谈。',
        ],
        [
          '事务里还调用了“发送通知”接口，自动重试怎样测试才不会重复通知？',
          '外部请求不会随数据库事务自动回滚。把可可靠恢复的通知意图与业务提交关联，再由有幂等约束的执行流程发送。用两个独立数据库连接控制交错顺序，触发冲突和死锁；断言最终版本、重试次数与有效通知次数，核对重试上限后给出的错误。',
        ],
      ],
    },
    {
      id: 'rdata-linux-resources',
      title: '上传突然写不进去，磁盘却还有空间',
      source: [
        'Linux man-pages · open 的资源与权限错误',
        'https://man7.org/linux/man-pages/man2/open.2.html',
      ],
      check: '能根据真实错误码区分空间、inode、文件描述符和权限问题，并用恢复后的资源曲线验证。',
      steps: [
        [
          'Linux 上上传失败，日志是 ENOSPC，但 df -h 看起来仍有剩余空间。下一步查什么？',
          '先确认应用实际写入路径和挂载点，容器可见的目录未必是刚才检查的文件系统。对目标路径检查块空间与 df -i 的 inode 使用率；大量小分片可能先耗尽 inode。也要核对文件系统或容器的配额及错误详情，避免看到机器总空间就直接排除存储问题。',
        ],
        [
          '删除大日志后，du 变小但 df 的空间没释放，可能是什么原因？',
          '文件已取消目录链接，但进程仍持有打开的描述符时，相关空间可能继续占用。用 lsof +L1 或受权限限制的 /proc/PID/fd 检查已删除但仍打开的文件；确认所属服务后通过正常重开日志或受控重启释放，不能把继续删除其他文件当作定位手段。',
        ],
        [
          '如果实际错误是 EMFILE，清理磁盘为什么无效？',
          'EMFILE 表示该进程打开的文件描述符达到限制，文件、套接字和管道都可能计入。比较 /proc/PID/fd 数量与 /proc/PID/limits，按描述符类型找增长来源；ENFILE 则涉及系统级打开文件限制。先查资源未关闭或并发过大，再评估容量，单纯提高限制可能只是延后失败。',
        ],
        [
          '管理员 shell 能写目录，应用仍报 EACCES。修复后怎样验证，而不只重试一次上传？',
          '核对应用实际用户、目录路径各级的访问权限、挂载状态以及适用的安全策略；按错误码区分权限拒绝和只读文件系统。用该服务身份验证受控写入，再持续运行并取消上传，观察分片清理、inode 与描述符是否回落，确认没有通过无限累积临时资源换来一次成功。',
        ],
      ],
    },
  ];
  PRACTICE_BANK.groups.push({
    id: group,
    name: '简历补查：数据、缓存与工程部署',
    cards: cases.map((c) => c.id),
  });
  for (const c of cases) PRACTICE_BANK.cards[c.id] = {...c, group};
  TOPIC_LEVELS.push({
    id: 28,
    name: '数据与部署追问',
    desc: '从数据库技能到镜像、代理和多进程交付',
    difficulty: 'hard',
    icon: '🗄️',
    questions: [
      {
        type: 'choice',
        chain: 'rdata-sql-transaction',
        q: 'InnoDB 报告死锁并回滚了当前事务，应用应如何恢复这次业务操作？',
        options: [
          '只重试最后一条 UPDATE',
          '忽略错误并向用户报告成功',
          '按有上限的策略重试完整事务，并处理外部副作用的幂等性',
          '永久关闭事务',
        ],
        answer: 2,
        explain:
          '死锁牺牲事务会整体回滚，不能假定前面语句仍生效。普通锁等待超时的回滚范围还需另查错误与配置。',
        detail: {
          example:
            '事务 A 先改目录 1 再改目录 2，事务 B 顺序相反，两边撞上互相等待，InnoDB 选了 B 作为牺牲者整体回滚。如果应用只重试最后一条 UPDATE，前面那些已经被回滚的改动就全丢了。正确做法是带退避上限地重试整个业务事务，并重新读取必要状态；如果事务里还调过发通知的接口，那个副作用不会跟着回滚，得单独做幂等。',
          code:
            'for (let attempt = 0; attempt < MAX; attempt++) {\n  try {\n    await db.transaction(async (tx) => { /* 完整业务事务 */ });\n    return;\n  } catch (e) {\n    if (!isDeadlock(e) || attempt === MAX - 1) throw e;\n    await sleep(backoff(attempt));\n  }\n}',
          pitfalls:
            '只重试最后一条语句，是最常见的错误，死锁回滚的是整个事务。把锁等待超时和死锁混为一谈也不行，超时的回滚范围默认可能只到语句，要按错误码和配置确认。统一资源访问顺序、缩短事务能减少冲突。外部副作用不在事务内，重试可能重复发送通知。',
        },
      },
      {
        type: 'choice',
        chain: 'rdata-linux-resources',
        q: '应用打开文件报 EMFILE，磁盘块空间和 inode 都充足，优先检查什么？',
        options: [
          '进程的描述符数量、类型与上限',
          '把所有 CSS 文件压缩',
          '给目录改一个更短的名字',
          '再次删除日志目录',
        ],
        answer: 0,
        explain:
          'EMFILE 指向进程级文件描述符限制。应排查未关闭资源与并发规模，容量调整后仍要验证资源是否持续增长。',
        detail: {
          example:
            '上传突然写不进去，磁盘块空间和 inode 都还有剩余，错误却是 EMFILE。这和磁盘无关：EMFILE 是该进程打开的文件描述符达到了上限，文件、套接字、管道全都算在内。先比 /proc/PID/fd 的数量和 /proc/PID/limits 的上限，再按描述符类型找出是谁在增长——多半是哪里没关。ENFILE 是系统级的上限，两者要分开看。',
          pitfalls:
            '看到“磁盘还有空间”就排除存储问题，方向直接偏了。EMFILE 和 ENOSPC 是两种完全不同的资源，前者查描述符、后者查块空间和 inode。直接调高上限只是把失败往后推，泄漏不修早晚还会到顶。删日志释放不了描述符，被进程占着的已删除文件空间也不会自动回来。',
        },
      },
      {
        type: 'choice',
        chain: 'rdata-sql-index',
        q: 'EXPLAIN 的 possible_keys 列出一个索引，下一步应该怎样确认实际执行情况？',
        options: [
          '认为该索引必然已使用',
          '看实际 key、访问方式、行数与排序，必要时在受控环境分析实际执行',
          '只比较索引名称长度',
          '删除其他索引后直接上线',
        ],
        answer: 1,
        explain:
          'possible_keys 只列出候选，实际选择看 key，并结合访问方式、估计扫描行数和排序判断。再用有代表性的数据与参数比较实际行数、循环次数和耗时；EXPLAIN ANALYZE 会执行查询，不能只把它当不运行 SQL 的静态检查。用了索引也不等于覆盖查询或没有大量扫描。',
        detail: {
          example:
            '文件列表有联合索引，查询却仍然扫了几十万行。EXPLAIN 的 possible_keys 里确实有这个索引，但那只是“候选”，不代表选了它。要看 key 实际选的哪一个、访问方式是 ref 还是 range、估计扫描多少行、有没有额外的 Using filesort。再用有代表性的数据跑 EXPLAIN ANALYZE 对比实际行数和耗时——注意它会真执行查询，得在受控环境里跑。',
          code:
            'EXPLAIN SELECT * FROM files\n WHERE tenant_id=? AND parent_id=? AND deleted=0\n ORDER BY created_at DESC, id DESC LIMIT 50;\n\n-- 索引候选\nCREATE INDEX idx_file_list ON files(tenant_id, parent_id, deleted, created_at DESC, id DESC);',
          pitfalls:
            'possible_keys 有值就当命中，是这里最典型的误读。只看估计行数不看实际行数，统计信息陈旧时判断会失真。用了索引也不等于覆盖查询，二级索引还要按主键回表。测试目录只有十条记录、查询都在一毫秒内，这个结论放到线上毫无意义。',
        },
      },
      {
        type: 'truefalse',
        chain: 'rdata-mongo-model',
        q: 'MongoDB 单文档更新是原子的，因此先读文件版本再无条件写回，也不会覆盖别人的并发修改。',
        answer: false,
        explain: '单次写的原子性不包含此前应用层读取。需要预期版本等条件，并检查更新是否匹配，处理冲突。',
        detail: {
          example:
            '两个运营同时读到 version=7，各自改完再无条件写回。MongoDB 的原子性只保证“这一次写”本身不会写一半，管不住“你读到 7 之后别人已经改成 8”。要带上预期版本做条件更新：updateOne({_id, tenantId, version: 7}, {...})，然后检查 matchedCount——1 才算成功，0 说明版本变了或对象不存在，得重读并提示冲突，不能继续当保存成功。',
          code:
            'const r = await col.updateOne(\n  { _id, tenantId, version: 7 },\n  { $set: { name, currentVersionId }, $inc: { version: 1 } },\n);\nif (r.matchedCount !== 1) throw new ConflictError();   // 版本已变',
          pitfalls:
            '把单文档原子性理解成“并发安全”，是这道题要拆开的点，原子性覆盖的是单次写，不覆盖之前的读取。检查更新结果却继续上报成功，等于把冲突吞掉了。把目录下所有文件和历史版本都塞进一个文档，数组无界增长会撞上 BSON 大小限制。外部的文件存储动作不在数据库事务里。',
        },
      },
      {
        type: 'choice',
        chain: 'rdata-cache-timeline',
        q: '延迟双删都成功后，哪个顺序仍可能产生旧缓存？',
        options: [
          '旧读在第二次删除前已经完成回填，之后没有其他请求',
          '所有读取只从最新数据源取值',
          '旧读在第二次删除后才恢复并回填旧值',
          '从未有请求读取或写入缓存',
        ],
        answer: 2,
        explain:
          '具体顺序是：第一次删除后 R 读到数据库旧值并暂停；W 提交新值并完成第二次删除；R 恢复后把手里的旧值回填。两次删除都成功仍出现旧缓存，说明固定延迟不是一致性保证。可靠失效任务只能解决任务丢失，还需单独处理旧读回填与关键授权时效。',
        detail: {
          example:
            '时间线是这样的：第一次删除后，读请求 R 从数据库读到旧值，但在回填之前卡住了；写请求 W 提交新值，并完成了延迟后的第二次删除；随后 R 恢复，把手里那份旧值写回空的缓存。两次删除都成功了，旧值还是回来了。这说明固定延迟不是一致性保证，它只是缩小了竞争窗口。把延迟从 500ms 改成 5 秒也只是换了个窗口。',
          pitfalls:
            '以为“删了两次就不会有旧值”，忽略了已经读过旧数据、只是还没回填的请求。延长延迟时间治标不治本，暂停、慢查询、副本延迟都能突破它。第一次删完、数据库也提交了，进程却在 setTimeout 之前重启，失效任务就丢了，需要持久化失效意图。权限撤销这类要求立即生效的场景，不能靠经验延迟来承诺。',
        },
      },
      {
        type: 'truefalse',
        chain: 'rdata-container-config',
        q: 'Vite 静态产物已构建完毕，只修改 Nginx 容器里的 VITE_API_URL 就能自动改变已有 JS 的请求地址。',
        answer: false,
        explain: '相关值已在构建时替换。要改变已有产物行为，需预先设计运行期配置读取，或重新构建对应产物。',
        detail: {
          example:
            '同一个前端镜像换了容器环境变量，页面还是请求测试地址。因为 import.meta.env 里的值在构建时就已经被替换进产物了，已经生成的浏览器脚本不会去读容器进程的环境变量。想让同一个不可变镜像跑不同环境，得让页面启动时去请求 /runtime-config.json，拿到地址后再创建 API 客户端。',
          code:
            '// 构建时替换，改了容器 ENV 不会变\nconst base = import.meta.env.VITE_API_URL;\n\n// 运行期读取：同一镜像可跑不同环境\nconst cfg = await fetch(\'/runtime-config.json\').then((r) => r.json());\ncreateApiClient(cfg.apiBase);',
          pitfalls:
            '把构建期变量当成运行期配置，是这里最核心的误解。以为把密钥放进 VITE_ 变量安全，其实它会原样进入浏览器产物，谁都能看到。Docker ARG/ENV 也不是存密钥的通道，可能留在镜像历史里。配置接口加载失败时不提示、悄悄回落到测试地址，会让问题更难发现。',
        },
      },
      {
        type: 'choice',
        chain: 'rdata-proxy-path',
        q: '普通 location /api/ 配置 proxy_pass http://backend/;，无 rewrite 或变量。请求 /api/files 通常转成哪个上游路径？',
        options: ['/files', '/api/api/files', '/backend/files', '/api/files/'],
        answer: 0,
        explain:
          'proxy_pass 带 URI /，会替换匹配的 /api/ 前缀。带变量、正则 location 或 rewrite 时需要另行分析。',
        detail: {
          example:
            '代理配置里少写或多写一个斜杠，API 就全 404 了。在普通前缀 location /api/ 下：proxy_pass http://backend;（不带 URI）通常保留 /api/files 原样转发；proxy_pass http://backend/;（带 URI /）会用它替换掉匹配的 /api/ 前缀，上游收到 /files。所以请求 /api/files 到上游变成了 /files。',
          code:
            'location /api/ {\n  proxy_pass http://backend;    # 上游收到 /api/files\n}\n\nlocation /api/ {\n  proxy_pass http://backend/;   # 上游收到 /files\n}',
          pitfalls:
            '只知道“加斜杠会去掉前缀”却不看清楚 location、rewrite 和变量的组合，换个配置就不成立。用户看到 404 时分不清是前端路由、Nginx 还是 Node 返回的，要用同一请求对齐访问日志和上游状态。SPA 回退把 API 的 404 兜底成 HTML 200，会让问题伪装成“接口总是成功”。',
        },
      },
      {
        type: 'choice',
        chain: 'rdata-pm2-state',
        q: 'PM2 cluster 多实例后，最需要检查哪类应用假设？',
        options: [
          '所有实例天然共享同一 JS Map',
          '内存会话和任务状态是否需要跨进程共享，以及定时任务是否重复启动',
          'PM2 会自动保存所有上传进度',
          '扩容会自动合并各实例本地文件',
        ],
        answer: 1,
        explain: '多进程可分担流量，但状态共享、持久化和任务唯一执行需要应用及存储协议提供。',
        detail: {
          example:
            '从单进程扩到四个实例后，同一用户查上传进度有时查不到、登录态偶尔丢失。因为会话和进度存在某个进程的内存 Map 里，请求落到别的实例自然就没了。PM2 只负责把流量分给多个进程，不会把这些数据变成共享的。迁移到 Redis 后还得处理过期策略、持久化配置和缓存丢失后的重建。',
          pitfalls:
            '以为 PM2 cluster 会自动共享内存，是最常见的误解，每个实例是独立的进程。粘性会话能缓解，但重启后状态照样丢，也挡不住别的实例需要协调。每个实例都启动一个清理定时器，任务会被重复执行。迁到 Redis 也不等于永久可靠，过期、持久化和丢缓存后的恢复都要单独定义。',
        },
      },
    ],
  });
}
