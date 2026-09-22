# 撤权与故障实测时间线

时区：以下原始时间均为UTC（北京时间加8小时）。功能故障记录为宿主机时钟；PG提交与权威读取来自同一个数据库时钟。Colima与宿主机存在偏移，不能直接用两种时钟的原始数值比较先后。

## 两实例下一请求撤权

无Pub/Sub。撤权前B确实命中L1，同时另查L2键仍存在；A、B进程不同。唯一写者撤销任命后，以revision行xmin取得确切提交时刻；B在A确认后才发新媒体请求，并读到新revision且返回403、无业务字节。

| 候选 | A/B进程 | DB提交/xmin | 宿主机撤销确认→下一请求 | DB下次权威读取 | revision旧→新 |
|---|---|---|---|---|---|
| native | 27529/27512 | 2026-09-22T23:16:14.103Z / 14304 | 2026-09-22T23:16:13.993Z → 2026-09-22T23:16:13.994Z | 2026-09-22T23:16:14.108Z | 1790118945615 → 1790118945616 |
| casbin | 27601/27561 | 2026-09-22T23:16:27.159Z / 14394 | 2026-09-22T23:16:27.006Z → 2026-09-22T23:16:27.007Z | 2026-09-22T23:16:27.164Z | 1790118945620 → 1790118945621 |

逐事件原始字段见 `raw/task5-final4-timeline.jsonl`；9项因果/版本/载荷独立核对见 `raw/controller-task5-timeline-audit.json`。带真实HMAC签名旧票据的前后验证另见 `raw/task5-ticket-final.jsonl`；不得把早期HTTP确认时间重新命名为DB提交时间。

## 故障注入与恢复

| 候选 | 阶段 | 首个→末个观察 | 输出路径数 | 状态 | 字面预期匹配／故障无业务字段 |
|---|---|---|---:|---|---|
| native | Redis timeout warm | 2026-09-22T23:16:02.353Z → 2026-09-22T23:16:07.044Z | 16 | 503 | True／True |
| native | Redis timeout recovery current authority | 2026-09-22T23:16:12.130Z → 2026-09-22T23:16:12.279Z | 16 | 200 | True／True |
| native | Redis disconnected warm | 2026-09-22T23:16:12.506Z → 2026-09-22T23:16:12.559Z | 16 | 503 | True／True |
| native | Redis disconnected cold restarted process | 2026-09-22T23:16:12.884Z → 2026-09-22T23:16:12.945Z | 16 | 503 | True／True |
| native | Redis reconnected current authority | 2026-09-22T23:16:13.047Z → 2026-09-22T23:16:13.195Z | 16 | 200 | True／True |
| native | DB authority unavailable | 2026-09-22T23:16:13.471Z → 2026-09-22T23:16:13.479Z | 16 | 503 | True／True |
| native | DB recovered authoritative current state | 2026-09-22T23:16:13.809Z → 2026-09-22T23:16:13.958Z | 16 | 200 | True／True |
| casbin | Redis timeout warm | 2026-09-22T23:16:15.253Z → 2026-09-22T23:16:19.953Z | 16 | 503 | True／True |
| casbin | Redis timeout recovery current authority | 2026-09-22T23:16:25.013Z → 2026-09-22T23:16:25.166Z | 16 | 200 | True／True |
| casbin | Redis disconnected warm | 2026-09-22T23:16:25.393Z → 2026-09-22T23:16:25.442Z | 16 | 503 | True／True |
| casbin | Redis disconnected cold restarted process | 2026-09-22T23:16:26.007Z → 2026-09-22T23:16:26.069Z | 16 | 503 | True／True |
| casbin | Redis reconnected current authority | 2026-09-22T23:16:26.177Z → 2026-09-22T23:16:26.326Z | 16 | 200 | True／True |
| casbin | DB authority unavailable | 2026-09-22T23:16:26.475Z → 2026-09-22T23:16:26.482Z | 16 | 503 | True／True |
| casbin | DB recovered authoritative current state | 2026-09-22T23:16:26.808Z → 2026-09-22T23:16:26.959Z | 16 | 200 | True／True |

每阶段逐行索引见 `fault-summary.json`。覆盖报表、聚合、媒体、附件、课程下载、本人账户、传统分页导出，以及报表/项目/账户的执行、领取和受限worker。故障通过真实Redis CLIENT PAUSE、容器停止/启动及PG停止/启动注入；进程冷启动单列。恢复200只说明本次路径恢复，不把拒绝或故障耗时算作正常查询性能。

该时间线属于目标原型证据，不补证G-01/G-02/G-04/G-05/G-06，不意味着生产OSS/CDN已经验证。
