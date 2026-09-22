"""Summarize preserved fault observations without changing or inferring raw outcomes."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'evidence/raw/task5-final4-task5.jsonl'
rows=[(n,json.loads(s)) for n,s in enumerate(source.read_text().splitlines(),1)]
prefixes=['Redis timeout warm','Redis timeout recovery current authority','Redis disconnected warm','Redis disconnected cold restarted process','Redis reconnected current authority','DB authority unavailable','DB recovered authoritative current state']
summary=[]
for candidate in ['native','casbin']:
 for prefix in prefixes:
  found=[(n,r) for n,r in rows if r['candidate']==candidate and r['name'].startswith(prefix)]
  if not found: continue
  statuses={str(r['actual'].get('status')) for _,r in found}
  summary.append({'candidate':candidate,'phase':prefix,'count':len(found),'first_at':found[0][1]['at'],'last_at':found[-1][1]['at'],'statuses':sorted(statuses),'all_expected_actual_equal':all(r['actual']==r['expected'] for _,r in found),'all_fault_payloads_empty':all(r['actual'].get('businessKeys')==[] for _,r in found if r['actual'].get('status')==503),'source':str(source.relative_to(ROOT)),'lines':[n for n,_ in found]})
result={'source':str(source.relative_to(ROOT)),'phases':summary,'scope':'Existing two-process functional/fault campaign only; independent cold/hot denial/fault timing windows are separate. Timestamps here are host observations, never substituted for DB commit time.'}
(ROOT/'evidence/fault-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
timeline=json.loads((ROOT/'evidence/raw/controller-task5-timeline-audit.json').read_text())
md=['# 撤权与故障实测时间线','','时区：以下原始时间均为UTC（北京时间加8小时）。功能故障记录为宿主机时钟；PG提交与权威读取来自同一个数据库时钟。Colima与宿主机存在偏移，不能直接用两种时钟的原始数值比较先后。','','## 两实例下一请求撤权','','无Pub/Sub。撤权前B确实命中L1，同时另查L2键仍存在；A、B进程不同。唯一写者撤销任命后，以revision行xmin取得确切提交时刻；B在A确认后才发新媒体请求，并读到新revision且返回403、无业务字节。','', '| 候选 | A/B进程 | DB提交/xmin | 宿主机撤销确认→下一请求 | DB下次权威读取 | revision旧→新 |','|---|---|---|---|---|---|']
for r in timeline['results']:
 md.append(f"| {r['candidate']} | {r['A']}/{r['B']} | {r['db_commit']} / {r['db_xmin']} | {r['host_revoke_ack']} → {r['host_next_request']} | {r['db_next_authority_read']} | {r['old_revision']} → {r['new_revision']} |")
md+=['','逐事件原始字段见 `raw/task5-final4-timeline.jsonl`；9项因果/版本/载荷独立核对见 `raw/controller-task5-timeline-audit.json`。带真实HMAC签名旧票据的前后验证另见 `raw/task5-ticket-final.jsonl`；不得把早期HTTP确认时间重新命名为DB提交时间。','','## 故障注入与恢复','','| 候选 | 阶段 | 首个→末个观察 | 输出路径数 | 状态 | 字面预期匹配／故障无业务字段 |','|---|---|---|---:|---|---|']
for r in summary:
 md.append(f"| {r['candidate']} | {r['phase']} | {r['first_at']} → {r['last_at']} | {r['count']} | {','.join(r['statuses'])} | {r['all_expected_actual_equal']}／{r['all_fault_payloads_empty']} |")
md+=['','每阶段逐行索引见 `fault-summary.json`。覆盖报表、聚合、媒体、附件、课程下载、本人账户、传统分页导出，以及报表/项目/账户的执行、领取和受限worker。故障通过真实Redis CLIENT PAUSE、容器停止/启动及PG停止/启动注入；进程冷启动单列。恢复200只说明本次路径恢复，不把拒绝或故障耗时算作正常查询性能。','','该时间线属于目标原型证据，不补证G-01/G-02/G-04/G-05/G-06，不意味着生产OSS/CDN已经验证。','']
(ROOT/'evidence/fault-timeline.md').write_text('\n'.join(md))
print(json.dumps({'phases':len(summary),'observations':sum(r['count'] for r in summary),'all_literal_equal':all(r['all_expected_actual_equal'] for r in summary)},ensure_ascii=False))
