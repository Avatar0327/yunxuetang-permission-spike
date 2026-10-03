# Native 撤权与故障时间线

所有日期为UTC。同钟分别比较宿主撤销确认→新请求、PG提交→权威读取；不跨宿主/Colima时钟推断微秒顺序。

| A/B PID | PG提交/xmin | 宿主确认→新请求 | PG权威读取 | revision | 9项检查 |
|---|---|---|---|---|---|
| 19466/19448 | 2026-10-03T13:54:19.204Z / 22479 | 2026-10-03T13:54:19.198Z → 2026-10-03T13:54:19.200Z | 2026-10-03T13:54:19.210Z | 1791035582300 → 1791035582301 | True |

| 阶段 | 首个→末个观察 | 路径数 | 预期状态 | 完整且匹配 |
|---|---|---:|---:|---|
| warm protected controls | 2026-10-03T13:53:55.456Z → 2026-10-03T13:53:55.638Z | 16 | 200 | True |
| Redis timeout warm | 2026-10-03T13:53:55.946Z → 2026-10-03T13:54:00.697Z | 16 | 503 | True |
| Redis timeout cold restarted process | 2026-10-03T13:54:06.312Z → 2026-10-03T13:54:11.132Z | 16 | 503 | True |
| Redis timeout recovery current authority | 2026-10-03T13:54:16.095Z → 2026-10-03T13:54:16.405Z | 16 | 200 | True |
| Redis timeout cold process recovery current authority | 2026-10-03T13:54:16.437Z → 2026-10-03T13:54:16.657Z | 16 | 200 | True |
| Redis disconnected warm | 2026-10-03T13:54:16.855Z → 2026-10-03T13:54:16.942Z | 16 | 503 | True |
| Redis disconnected cold restarted process | 2026-10-03T13:54:17.313Z → 2026-10-03T13:54:17.430Z | 16 | 503 | True |
| Redis reconnected current authority | 2026-10-03T13:54:17.789Z → 2026-10-03T13:54:17.975Z | 16 | 200 | True |
| DB authority unavailable | 2026-10-03T13:54:18.544Z → 2026-10-03T13:54:18.567Z | 16 | 503 | True |
| DB recovered authoritative current state | 2026-10-03T13:54:18.924Z → 2026-10-03T13:54:19.140Z | 16 | 200 | True |

拒绝与故障均不计入正常成功性能。只证明本次原型路径，不补证五项永久缺口或真实媒体网关。源码与所有逐条载荷、票据、N+1、移籍记录同包保留。
