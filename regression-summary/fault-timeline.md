# Native 撤权与故障时间线

所有日期为UTC。同钟分别比较宿主撤销确认→新请求、PG提交→权威读取；不跨宿主/Colima时钟推断微秒顺序。

| A/B PID | PG提交/xmin | 宿主确认→新请求 | PG权威读取 | revision | 9项检查 |
|---|---|---|---|---|---|
| 99404/99314 | 2026-10-03T09:48:58.216Z / 21820 | 2026-10-03T09:48:58.216Z → 2026-10-03T09:48:58.219Z | 2026-10-03T09:48:58.224Z | 1791020890766 → 1791020890767 | True |

| 阶段 | 首个→末个观察 | 路径数 | 预期状态 | 完整且匹配 |
|---|---|---:|---:|---|
| warm protected controls | 2026-10-03T09:48:34.245Z → 2026-10-03T09:48:34.522Z | 16 | 200 | True |
| Redis timeout warm | 2026-10-03T09:48:34.834Z → 2026-10-03T09:48:39.512Z | 16 | 503 | True |
| Redis timeout cold restarted process | 2026-10-03T09:48:45.484Z → 2026-10-03T09:48:50.206Z | 16 | 503 | True |
| Redis timeout recovery current authority | 2026-10-03T09:48:55.264Z → 2026-10-03T09:48:55.534Z | 16 | 200 | True |
| Redis timeout cold process recovery current authority | 2026-10-03T09:48:55.559Z → 2026-10-03T09:48:55.833Z | 16 | 200 | True |
| Redis disconnected warm | 2026-10-03T09:48:56.026Z → 2026-10-03T09:48:56.132Z | 16 | 503 | True |
| Redis disconnected cold restarted process | 2026-10-03T09:48:56.630Z → 2026-10-03T09:48:56.731Z | 16 | 503 | True |
| Redis reconnected current authority | 2026-10-03T09:48:56.868Z → 2026-10-03T09:48:57.098Z | 16 | 200 | True |
| DB authority unavailable | 2026-10-03T09:48:57.522Z → 2026-10-03T09:48:57.548Z | 16 | 503 | True |
| DB recovered authoritative current state | 2026-10-03T09:48:57.909Z → 2026-10-03T09:48:58.153Z | 16 | 200 | True |

拒绝与故障均不计入正常成功性能。只证明本次原型路径，不补证五项永久缺口或真实媒体网关。源码与所有逐条载荷、票据、N+1、移籍记录同包保留。
