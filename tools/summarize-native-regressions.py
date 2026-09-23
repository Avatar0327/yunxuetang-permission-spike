"""Independent Native regression summary; accepts one isolated raw campaign, no live accesses."""
from pathlib import Path
from datetime import datetime
from collections import Counter
import json,sys,hashlib
p=Path(sys.argv[1]);raw=p/'workspace/evidence/raw';out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False)
def lines(name):
 q=raw/name
 return [(i,json.loads(x)) for i,x in enumerate(q.read_text().splitlines(),1)]
rows=lines('observations.jsonl');assert rows and all(r['candidate']=='native' for _,r in rows)
issues=[{'line':i,'name':r['name']} for i,r in rows if r['actual']!=r['expected']]
prefixes=['warm protected controls','Redis timeout warm','Redis timeout cold restarted process','Redis timeout recovery current authority','Redis timeout cold process recovery current authority','Redis disconnected warm','Redis disconnected cold restarted process','Redis reconnected current authority','DB authority unavailable','DB recovered authoritative current state']
phases=[]
for prefix in prefixes:
 found=[(i,r) for i,r in rows if r['name'].startswith(prefix+' ')]
 faulty=prefix in ('Redis timeout warm','Redis timeout cold restarted process','Redis disconnected warm','Redis disconnected cold restarted process','DB authority unavailable')
 expected=503 if faulty else 200
 ok=len(found)==16 and all(r['actual']==r['expected'] and r['actual'].get('status')==expected and (not faulty or r['actual'].get('businessKeys')==[]) for _,r in found)
 if not ok:issues.append({'phase':prefix,'reason':'requires_exactly16_literal_expected_protected_paths','count':len(found)})
 phases.append({'phase':prefix,'count':len(found),'statusExpected':expected,'allChecks':ok,'firstAt':found[0][1]['at'] if found else None,'lastAt':found[-1][1]['at'] if found else None,'rawLines':[i for i,_ in found]})
def dt(v):return datetime.fromisoformat(v.replace('Z','+00:00'))
time=[]
for i,r in lines('commit-timeline.jsonl'):
 assert r['candidate']=='native';a=r['revoke'];b=r['next'];w=r['warm'];am=a['body']['meta'];bm=b['body']['meta'];c=r['committed'];before=r['before']
 checks={'different_processes':str(am['pid'])!=str(bm['pid']),'B_previously_L1':all(x['status']==200 and x['body']['authorization']['cache']=='L1' and x['body']['meta']['pid']==bm['pid'] for x in w),'PubSub_absent':all(x['body']['meta']['pubsub'] is False for x in [*w,a,b]),'revision_plus_one':int(c['revision'])==int(before['revision'])+1,'new_transaction':c['xmin']!=before['xmin'],'request_after_ack_host_clock':dt(bm['requestAt'])>=dt(am['responseAt']),'authority_after_commit_DB_clock':dt(bm['authorityObservedAt'])>=dt(c['committed_at']),'new_revision':int(bm['observedRevision'])==int(c['revision']),'denied_no_business':b['status']==403 and set(b['body'])=={'message','meta'}}
 if not all(checks.values()):issues.append({'timelineLine':i,'checks':checks})
 time.append({'line':i,'checks':checks,'allChecks':all(checks.values()),'A':am['pid'],'B':bm['pid'],'dbCommit':c['committed_at'],'xmin':c['xmin'],'ack':am['responseAt'],'nextRequest':bm['requestAt'],'authorityRead':bm['authorityObservedAt'],'beforeRevision':before['revision'],'afterRevision':c['revision']})
if len(time)!=1:issues.append({'timelineCount':len(time),'expected':1})
files=[{'path':str(q.relative_to(p)),'bytes':q.stat().st_size,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()} for q in sorted(raw.rglob('*')) if q.is_file()]
result={'sourceCommit':(p/'source-commit.txt').read_text().strip(),'testExit':int((p/'test-exit.txt').read_text()),'observations':len(rows),'allLiteralEqual':not any(r['actual']!=r['expected'] for _,r in rows),'phases':phases,'timeline':time,'issues':issues,'complete':not issues and int((p/'test-exit.txt').read_text())==0,'scope':'Selected Native two-host-process regression, not full 24-group rerun or capped performance gate; exact observations retained.','rawFiles':files};(out/'regression-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
md=['# Native 整改回归实测逐条记录','','仅本次选定回归；不把旧矩阵未重跑项重新记为通过。源码 '+result['sourceCommit']+'。','','| 行号 | 用例 | 字面预期 | 实际结果 | 判断 |','|---:|---|---|---|---|']
esc=lambda x:json.dumps(x,ensure_ascii=False).replace('|','&#124;').replace('\n',' ')
for i,r in rows:md.append(f"| {i} | {r['name']} | {esc(r['expected'])} | {esc(r['actual'])} | {'通过' if r['actual']==r['expected'] else '失败'} |")
(out/'regression-matrix.md').write_text('\n'.join(md)+'\n')
md=['# Native 撤权与故障时间线','','所有日期为UTC。同钟分别比较宿主撤销确认→新请求、PG提交→权威读取；不跨宿主/Colima时钟推断微秒顺序。','','| A/B PID | PG提交/xmin | 宿主确认→新请求 | PG权威读取 | revision | 9项检查 |','|---|---|---|---|---|---|']
for x in time:md.append(f"| {x['A']}/{x['B']} | {x['dbCommit']} / {x['xmin']} | {x['ack']} → {x['nextRequest']} | {x['authorityRead']} | {x['beforeRevision']} → {x['afterRevision']} | {x['allChecks']} |")
md+=['','| 阶段 | 首个→末个观察 | 路径数 | 预期状态 | 完整且匹配 |','|---|---|---:|---:|---|']
for x in phases:md.append(f"| {x['phase']} | {x['firstAt']} → {x['lastAt']} | {x['count']} | {x['statusExpected']} | {x['allChecks']} |")
md+=['','拒绝与故障均不计入正常成功性能。只证明本次原型路径，不补证五项永久缺口或真实媒体网关。源码与所有逐条载荷、票据、N+1、移籍记录同包保留。']
(out/'fault-timeline.md').write_text('\n'.join(md)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('rawFiles','phases','timeline')},ensure_ascii=False));assert result['complete']
