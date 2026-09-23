# Native 权限性能归因报告（阶段 1）

阶段 1 独立交付；仅归因，未以此宣布权限门禁通过。阶段 2 在本报告交付后才能实施。

实测提交 `b3ea7781deb481b4f6db9e64189a182d2f879944`。65 份 v8.3 正本核验一致，无重新基线化；原算法、SQL、索引、超时与业务真值不变。

## 1. 同资源完整参考窗口

API A/B 各 2 CPU / 4 GiB；PG 4 CPU / 8 GiB；Redis 1 CPU / 1 GiB。5 万主租户人员、500 第二租户人员、2000 部门、20 层、20 角色、100 万负载事实（另有2条夹具事实）。每窗50客户端×600秒，四场景混合轮转、分场景判定，冷仅强制权限快照不命中，不清数据库页缓存。

| 缓存 | 开始～结束 UTC | 时长秒 | 总数/成功/失败 | 正常非成功率 | 真值差异/测量错误 |
|---|---|---:|---|---:|---|
| hot | 2026-09-23T04:15:01.505Z～2026-09-23T04:25:05.879Z | 604.37 | 7531/6931/600 | 7.967% | 0/0 |
| cold | 2026-09-23T04:26:56.382Z～2026-09-23T04:37:02.867Z | 606.43 | 6335/5153/1182 | 18.658% | 0/0 |

权限p95≤50ms；列表含过滤/count端到端p95≤500ms；历史聚合p95≤2000ms。正常非成功率≤0.1%，按每窗及每场景独立判定，任何授权错误即不通过。0.1%对应本地资格测试至少99.9%正常请求成功，防止剔除大量失败后只看成功p95；不是生产SLA。故障/拒绝不并入成功性能。

| 缓存/场景 | 成功/总数 | 非成功率 | 权限 p50/p95/p99 ms | HTTP p50/p95/p99 ms | 结果 |
|---|---:|---:|---|---|---|
| hot/list-broad | 1844/1883 | 2.071% | 796.49/1888.20/2277.74 | 1021.73/2246.96/2612.23 | 未通过 |
| hot/history-broad | 1859/1883 | 1.275% | 619.31/1589.07/1962.92 | 3378.99/7190.27/8463.86 | 未通过 |
| hot/list-constrained | 1846/1883 | 1.965% | 857.72/1908.17/2290.28 | 1486.27/2654.05/3183.21 | 未通过 |
| hot/history-constrained | 1382/1882 | 26.567% | 818.01/1939.94/2393.83 | 9267.65/11140.01/11822.87 | 未通过 |
| cold/list-broad | 1564/1584 | 1.263% | 995.02/2285.61/2735.07 | 1215.35/2662.75/3120.90 | 未通过 |
| cold/history-broad | 1545/1584 | 2.462% | 808.40/1979.64/2365.47 | 4359.23/9386.98/10406.55 | 未通过 |
| cold/list-constrained | 1561/1584 | 1.452% | 1101.01/2416.69/2794.97 | 1873.22/3396.55/3880.07 | 未通过 |
| cold/history-constrained | 483/1583 | 69.488% | 1105.53/2280.83/2693.07 | 9869.80/11747.39/12312.15 | 未通过 |

## 2. 时间占比：按实际 p95 请求，不相加组件 p95

宿主机客户端与 Colima 服务端使用各自单调时钟。实测发现大量“客户端时长减服务端时长”为负，原分析稿已保留并标为不可用于跨时钟相减；没有清零或当作负网络耗时。下表按**客户端 HTTP 耗时**选取每场景真实 p95 请求，使用**该请求服务端同一时钟内总耗时**作分段占比分母。HTTP数值单列，服务端时间不强行凑成客户端100%。因此是端到端p95对应请求的服务端主要成本，不宣称精确拆解跨时钟网络时延。

嵌套span按区间并集拆为互斥片段，平行重叠单列；p90～p99群体用同样服务端分母交叉核对。SQL roundtrip包括驱动参数编码、数据库/网络等待和结果解析，不能视为纯DB CPU。事件循环是重叠旁证，不加入下面总和。

| 缓存/场景 | HTTP p95 ms | 同请求服务端 ms | 累计≥80%的互斥片段（ms，占服务端%） | 合计% |
|---|---:|---:|---|---:|
| hot/list-broad | 2246.96 | 2267.24 | pool.acquire@authority.current 1178.22（51.97%）；pool.acquire@scope.resolve 566.82（25.00%）；pool.acquire@authority.token 167.92（7.41%） | 84.37% |
| hot/history-broad | 7190.27 | 7311.04 | sql.roundtrip[75b191b0575a]@report.list 6599.86（90.27%） | 90.27% |
| hot/list-constrained | 2654.05 | 2672.15 | pool.acquire@authority.current 1427.80（53.43%）；sql.roundtrip[aecc7cad20fb]@report.list 321.10（12.02%）；pool.acquire@scope.resolve 271.24（10.15%）；sql.roundtrip[1b64bdaa86b6]@report.list 182.54（6.83%） | 82.43% |
| hot/history-constrained | 11140.01 | 11313.69 | sql.roundtrip[7f276423032a]@report.list 9595.14（84.81%） | 84.81% |
| cold/list-broad | 2662.75 | 2708.31 | pool.acquire@authority.current 1210.63（44.70%）；pool.acquire@snapshot.build 595.39（21.98%）；pool.acquire@scope.resolve 558.74（20.63%） | 87.31% |
| cold/history-broad | 9386.98 | 9513.16 | sql.roundtrip[75b191b0575a]@report.list 9488.74（99.74%） | 99.74% |
| cold/list-constrained | 3396.55 | 3445.69 | pool.acquire@authority.current 1423.52（41.31%）；sql.roundtrip[aecc7cad20fb]@report.list 503.15（14.60%）；pool.acquire@snapshot.build 477.77（13.87%）；sql.roundtrip[1b64bdaa86b6]@report.list 340.89（9.89%）；pool.acquire@scope.resolve 180.78（5.25%） | 84.92% |
| cold/history-constrained | 11747.39 | 11900.23 | sql.roundtrip[7f276423032a]@report.list 9894.09（83.14%） | 83.14% |

完整分段、代表请求ID和尾部群体在每窗 `server-clock-attribution.json`。下面权限占比另按原权限指标自身p95选请求，不能与上表拼成一个请求。分段为token、plan与compile同钟总和；原权限指标与观测根区间的边界差单列，字段/source表达式等外围同步工作仍计入原门禁指标。

| 缓存/场景 | 原权限p95 ms | 已观测根区间ms | 差额ms | 累计≥80%片段 | 合计% |
|---|---:|---:|---:|---|---:|
| hot/list-broad | 1888.20 | 1888.18 | 0.0154 | pool.acquire@authority.current 1394.90（73.88%）；pool.acquire@authority.token 385.68（20.43%） | 94.30% |
| hot/history-broad | 1589.07 | 1589.06 | 0.0061 | pool.acquire@authority.current 1430.98（90.05%） | 90.05% |
| hot/list-constrained | 1908.17 | 1908.16 | 0.0164 | pool.acquire@authority.current 936.53（49.08%）；pool.acquire@authority.token 614.28（32.19%） | 81.27% |
| hot/history-constrained | 1939.94 | 1939.93 | 0.0112 | pool.acquire@authority.current 1421.29（73.27%）；sql.roundtrip[c9e1dad13ff8]@scope.resolve 232.51（11.99%） | 85.25% |
| cold/list-broad | 2285.61 | 2285.60 | 0.0171 | pool.acquire@authority.current 1791.30（78.37%）；pool.acquire@scope.resolve 246.38（10.78%） | 89.15% |
| cold/history-broad | 1979.64 | 1979.64 | 0.0080 | pool.acquire@authority.current 1547.89（78.19%）；pool.acquire@snapshot.build 277.75（14.03%） | 92.22% |
| cold/list-constrained | 2416.69 | 2416.67 | 0.0161 | pool.acquire@scope.resolve 906.81（37.52%）；pool.acquire@authority.current 566.35（23.44%）；pool.acquire@snapshot.build 346.74（14.35%）；pool.acquire@authority.token 292.72（12.11%） | 87.42% |
| cold/history-constrained | 2280.83 | 2280.82 | 0.0164 | pool.acquire@authority.current 1283.84（56.29%）；pool.acquire@scope.resolve 367.21（16.10%）；pool.acquire@authority.token 167.55（7.35%）；pool.acquire@snapshot.build 115.89（5.08%） | 84.82% |

## 3. 快照、序列化、每条SQL、连接池与事件循环

`supplement.json`保存每场景每个SQL指纹的调用数、p50/p95/p99、结果行数与失败类别；没有把多条独立SQL的p95相加。完整快照build/parse/stringify/normalize、cap.parseBatch、scope.resolve及编译分段均在原始trace。

| 缓存/场景 | pool.acquire p50/p95/p99 ms | 采样最大等待队列 | 获取失败数 |
|---|---|---:|---:|
| hot/list-broad | 15.39/281.30/488.43 | 14 | 39 |
| hot/history-broad | 14.56/235.60/435.81 | 13 | 24 |
| hot/list-constrained | 13.24/268.00/480.70 | 14 | 37 |
| hot/history-constrained | 13.05/266.88/468.69 | 14 | 27 |
| cold/list-broad | 19.41/277.18/475.26 | 13 | 20 |
| cold/history-broad | 19.45/263.05/423.59 | 13 | 14 |
| cold/list-constrained | 16.44/260.27/453.82 | 13 | 23 |
| cold/history-constrained | 16.49/266.46/464.46 | 14 | 17 |

pool.acquire含排队、建连和回调调度；饱和计数仅为获取时快照指标。API连接池各20，上限不变。

| 缓存/进程 | 1秒区间p95延迟的p50/p95/p99 ms | 区间利用率p50/p95 | 丢失数 |
|---|---|---|---:|
| hot/server:A | 13.66/16.15/17.87 | 0.17/0.26 | 0 |
| hot/server:B | 13.81/16.60/17.99 | 0.17/0.27 | 0 |
| hot/client:46123 | 11.10/11.29/11.42 | 0.01/0.02 | 0 |
| cold/server:A | 14.25/17.37/19.84 | 0.18/0.29 | 0 |
| cold/server:B | 14.14/17.12/18.64 | 0.18/0.30 | 0 |
| cold/client:46742 | 11.09/11.31/12.09 | 0.01/0.02 | 0 |

上述是与测量窗口相交的区间统计分布，不是所有事件循环样本合并后的p95；边界区间可能含少量预热/排空。资源30秒采样另存resources.jsonl，不将CPU采样相关性冒充每次SQL的精确CPU用时。

### 3.1 快照及序列化实测补表

下表是**各阶段自己的p95**，只用于比较量级，不相加；build含其子SQL/池等待，normalize含cap.parseBatch。缺省表示该窗口没有该路径的成功样本（热窗命中不构建，冷窗重新构建不解析缓存）。

| 缓存/场景 | build | parse | stringify | normalize | 编译pair stringify | 响应serialize |
|---|---:|---:|---:|---:|---:|---:|
| hot/list-broad | — | 0.03 | — | 0.09 | — | 0.05 |
| hot/list-constrained | — | 4.17 | — | 8.11 | — | 0.05 |
| hot/history-broad | — | 0.03 | — | 0.09 | — | 0.03 |
| hot/history-constrained | — | 4.19 | — | 8.03 | 3.22 | 0.03 |
| cold/list-broad | 497.51 | — | 0.03 | 0.11 | — | 0.06 |
| cold/list-constrained | 575.69 | — | 4.64 | 10.03 | — | 0.06 |
| cold/history-broad | 498.52 | — | 0.03 | 0.11 | — | 0.05 |
| cold/history-constrained | 581.32 | — | 3.70 | 9.26 | 3.81 | 0.04 |

### 3.2 p90～p99尾部群体交叉核对

以各场景HTTP排序选尾部群体，分母为这批请求各自服务端时间之和；不跨宿主机/虚拟机时钟相减。

| 缓存/场景 | 群体请求数 | 累计≥80%的片段及占比 |
|---|---:|---|
| hot/list-broad | 167 | pool.acquire@authority.current 56.41%；pool.acquire@report.list 15.28%；pool.acquire@scope.resolve 12.08%（合计83.77%） |
| hot/history-broad | 168 | sql.roundtrip[75b191b0575a]@report.list 86.89%（合计86.89%） |
| hot/list-constrained | 167 | pool.acquire@authority.current 46.08%；sql.roundtrip[aecc7cad20fb]@report.list 13.16%；pool.acquire@report.list 10.30%；pool.acquire@scope.resolve 8.42%；sql.roundtrip[1b64bdaa86b6]@report.list 7.40%（合计85.35%） |
| hot/history-constrained | 126 | sql.roundtrip[7f276423032a]@report.list 85.74%（合计85.74%） |
| cold/list-broad | 142 | pool.acquire@authority.current 49.81%；pool.acquire@snapshot.build 12.22%；pool.acquire@report.list 12.16%；pool.acquire@scope.resolve 9.97%（合计84.16%） |
| cold/history-broad | 140 | sql.roundtrip[75b191b0575a]@report.list 86.27%（合计86.27%） |
| cold/list-constrained | 142 | pool.acquire@authority.current 34.30%；sql.roundtrip[aecc7cad20fb]@report.list 14.88%；pool.acquire@snapshot.build 9.78%；sql.roundtrip[1b64bdaa86b6]@report.list 8.98%；pool.acquire@report.list 8.05%；pool.acquire@scope.resolve 7.17%（合计83.16%） |
| cold/history-constrained | 45 | sql.roundtrip[7f276423032a]@report.list 81.79%（合计81.79%） |

### 3.3 相同SQL的窗口后执行计划诊断

两个参考窗结束后，原SQL/参数各执行一次EXPLAIN ANALYZE BUFFERS。没有改SQL或索引；单次无负载计划**不是并发性能门禁**，只定位访问形状。SQL计时为PG进程时钟，HTTP门禁仍用原窗口。

| 场景/数据SQL指纹 | PG执行ms | 宿主往返ms |
|---|---:|---:|
| history-broad/75b191b0575a | 175.29 | 176.65 |
| history-constrained/7f276423032a | 758.45 | 779.66 |
| list-broad/518b6f0b2e02 | 16.20 | 31.62 |
| list-broad/202e9cf2235b | 0.21 | 2.49 |
| list-constrained/aecc7cad20fb | 22.54 | 57.07 |
| list-constrained/1b64bdaa86b6 | 13.45 | 35.97 |

复杂历史查询使用fact_company_person索引扫描并经Nested Loop/Memoize关联当前人员投影，返回457,673条事实；Memoize关联循环457,673次、实际人员索引查找22,875次。宽历史查询扫描1,000,002条事实并并行Hash Join后聚合。原始计划含参数、行数、buffer与loops；阶段2应针对这些访问和连接持有成本验证表示/索引/查询方案，不能仅凭本表宣布换索引就达标。

## 4. 新失败逐笔归因

| 缓存 | 原始边界错误 | 次数 | 证据含义 |
|---|---|---:|---|
| hot | POOL_ACQUIRE_TIMEOUT | 127 | 原pool.acquire失败span及800ms获取超时；不冒称SQL已执行。 |
| hot | 57014 | 473 | 原SQL失败span及原始SQLSTATE；结合固定10秒statement_timeout核对语句取消边界。不是推测的Redis故障。 |
| cold | 57014 | 1108 | 原SQL失败span及原始SQLSTATE；结合固定10秒statement_timeout核对语句取消边界。不是推测的Redis故障。 |
| cold | POOL_ACQUIRE_TIMEOUT | 74 | 原pool.acquire失败span及800ms获取超时；不冒称SQL已执行。 |

每笔requestId、场景、原始错误链、失败span/SQL指纹和结果保存在supplement.json及独立审计。客户端传输症状、服务端终止边界与深层资源成因分别记录，不用“首个错误码”自动替代人工逻辑复核。

## 5. 历史失败、观测限制与纪律

## 历史失败保留

前轮 30,863 次请求中，1,789 次 HTTP 503、244 次传输超时。Native 热/冷分别 139/79 次 503；Casbin 热/冷分别 345/1226 次 503，244 次传输异常全部来自 Casbin 冷窗口。旧日志丢失原异常，2033 条逐笔索引的根因均不可追溯。用户已接受保留缺口，以新 Native 同资源完整归因作为阶段 2 前提。本轮不重跑 Casbin，也不把本轮错误原因回填旧记录。

## 观测局限

此前 48 次 HTTP 开关对照通过业务载荷、count、字段与查询次数一致性。每单元仅 3 次的延迟中位数差 −3.56%～+10.83%，不足以证明高负载观测开销上界。完整观测窗口与旧无观测窗口的差异同时受运行波动影响，不能全部归因于观测。旧冒烟热/PG 原始进程流曾被端口同名文件覆盖，提取诊断仍在；缺失流不重建。benchmark-smoke 早于最终 returnedRows 字段，不充作最终 schema 完整窗口证据。后续采集已改唯一文件名，参考窗分别保留 A/B 原始流。

## 范围与纪律

正式业务代码仓库尚未建立；目前只有本地原型 Git 仓库 `/Users/peng/Agent本地开发/云学堂权限预研`，分支 `spike/native-performance-v83`，无 remote。原型折抵 0，正式 B1 未启动；万人容量、真实媒体网关、OSS/CDN、灾备继续后续批次。

G-01/G-02/G-04/G-05/G-06 五项永久缺口保留；D-42 与 T-10 均为我方定义、原站未验证。七项仍待正式评审逐条宣读并由人签署：AC-N-03打开不学；AC-E-01当日看板无数据；AC-E-02进度100%但时长0；AC-E-03打开即完成；AC-E-22逾期当晚未扣分正常；AC-N-11作业提交不发分、合格才发；AC-E-25删除必修任务使学员正向完成并补发学分。面授固定表单、请假单级固定审批、课程无审核、无北森及飞书钉钉触达四项最简实现不变；5 万名册手工维护、站内消息触达不足两项已承担风险保留。B4-16 完成验收后才能开始 B4-14。


## 6. 归因结论与证据完整性

**阶段1归因证据具备，允许据此制定已授权的Native整改；当前权限性能仍为No-Go，正式B1不启动。** 两窗共13,866次请求，12,084成功、1,782个503、0传输异常。新的1,782个503逐笔归因为1,581次数据SQL超时、201次连接池获取超时，与旧1,789/244缺口是两批不同证据。SQL超时中1,556次为复杂历史、25次为宽历史。

普通列表尾部主要等待共享连接池；历史聚合数据SQL在对应p95请求服务端时间中占83.14%～99.74%。权限指标的主要成本同样是多次权威读取/范围查询前的池获取等待，不能把这些毫秒都说成业务规则的纯计算成本。复杂身份缓存解析/规范化为个位到约10ms量级，冷构建的数百ms包含SQL及排队。PG资源采样近4核上限，API事件循环与序列化不是本轮秒级时延的主要直接片段；这不等于证明观测开销为零。

两个独立逐请求审计均auditVersion2、completeEvidence=true、issueCount=0。13,866个测量ID全部唯一精确匹配；676,937个span父子包含关系正确，无丢记录/错误/字段计数；189,752次成功SQL均含returnedRows。完整HTTP200结果按冻结独立真值核对，授权差异及测量错误0。所有503的原始错误、失败叶子及祖先传播链逐条核对，并非只取首个错误码。原始gate文件仍记录性能失败。

单独SQL执行与CPU饱和属于定位证据，尚未分离共享池竞争的全部因果效应。后续整改需同资源冷热和撤权/故障回归，不提高SQL/Redis/池超时、不提高资源上限、不删除权威读取、不改变公司/来源/字段规则。业务允许的T-1预聚合可作为方案，但若实际采用，必须补刷新节奏/新鲜度/当前撤权验证；本阶段未采用。

计时限制明确保留：热窗6,439、冷窗4,600个成功请求出现宿主时长小于服务端时长；热窗两实例区间单调时间与墙钟累计差约8.355秒，差异非固定比例。具体平台时钟机制未查明，不能据此计算精确网络耗时或微秒级跨机顺序，也不据此校正原门禁数字。报告的80%结论限于观测到的同一服务端时间轴；临近门槛的整改结论需另查计时有效性，不能借时钟差异放宽门槛。

## 7. 单独交付记录与索引

技术编制与数据复核：Codex，2026-09-23T12:48:49+08:00。业务人工签字：未代签。阶段1交付不是最终整改Go/No-Go签字。

- 原型源代码：`/Users/peng/Agent本地开发/云学堂权限预研`；正式业务仓库尚未建立，无remote。
- 原始证据：`evidence/raw/native-remediation-stage1/{hot,cold}`，每窗含measurement、两实例日志、runtime、resources、原版attribution.json、修订server-clock-attribution.json、supplement.json、独立审计。
- `attribution.json`是保留的原始分析稿，其跨时钟负残差不能当作span损坏或用于客户端100%分解；采用修订同钟版本和auditVersion2的完整性裁定。
- 每条SQL/每阶段统计、完整失败清单、p95请求ID、p90～p99群体、clock审计均随阶段1归因证据包交付；文件指纹只证明完整性，不证明性能通过。
- [阶段1归因证据目录](预研证据/Native性能整改_v8.3_20260923/阶段1_归因/) 含源码包、git bundle、原始证据包与SHA-256。
