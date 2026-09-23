"""Final delivery audit: existing source, raw evidence, artifacts, discipline; no Go inference."""
from pathlib import Path
from datetime import datetime
from collections import Counter
import hashlib,json,re,subprocess
ROOT=Path.cwd();TECH=Path('/Users/peng/Library/Mobile Documents/com~apple~CloudDocs/Agent复刻项目/云学堂复刻规划/03_技术方案');PLAN=TECH.parent
checks=[]
def check(name,ok,evidence):
 checks.append({'requirement':name,'verified':bool(ok),'evidence':evidence})
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
f=json.loads((TECH/'核验记录/输入文件指纹.json').read_text()); expected={x['path']:x['sha256'] for x in f['files']};actual={str(p.relative_to(PLAN)):sha(p) for p in PLAN.rglob('*') if p.is_file() and TECH not in p.parents and p.name!='.DS_Store'}
h=[x for x in f['rebaseline_history'] if x['from_version']=='v8.2' and x['to_version']=='v8.3']
check('65 canonical inputs unchanged; exact authorized rebaseline with rename',len(actual)==65 and actual==expected and len(h)==1 and len(h[0]['changed_files'])==3 and any(x['old_path']=='交接说明_v8.2.md' and x['new_path']=='交接说明_v8.3.md' for x in h[0]['changed_files']),'03/核验记录/输入文件指纹.json + fresh SHA256')
a=(TECH/'11_范围与工期重估.md').read_text();trace=(TECH/'07_需求与验收追踪.md').read_text();report=(TECH/'12_权限预研报告.md').read_text();adr=(TECH/'13_Native与Casbin取舍ADR.md').read_text()
check('D43/D44 synchronized and approvedA preserved',all(s in a for s in ['29～43','45～65','16～25','265～417','271～429']) and 'B2-A1' in trace and 'B2-A2' in trace,'03/11 +03/07; numerical ledger separately checked by verify-documents.py')
m=json.loads((ROOT/'evidence/coverage-map.json').read_text());decl=json.loads((ROOT/'docs/acceptance-manifest.json').read_text());required={r['id'] for g in decl['groups'] for r in g['required_subcases']};ids=Counter(x['id'] for x in m['items']);counts=Counter(x['status'] for x in m['items'])
check('Full frozen 24groups/168points have measured results, no reduced scope',len(decl['groups'])==24 and len(required)==168 and set(ids)==required and all(n==1 for n in ids.values()) and counts=={'pass':163,'fail':5},'docs/acceptance-manifest.json; evidence/coverage-map.json; controller-semantic-review.json')
for name,prefixes in [('T05 union and role-local override',['AUTH-T03','AUTH-T04']),('T06 backend appointment and surviving role',['AUTH-T06']),('T07 customerA/customerB/internal and historical isolation',['AUTH-T21','AUTH-T22','AUTH-T23'])]:
 rows=[r for r in m['items'] if any(r['id'].startswith(p+'-') for p in prefixes)]
 check(name,rows and all(r['status']=='pass' and r['evidence'] and r['actualResult'] for r in rows),[r['id'] for r in rows])
b=json.loads((ROOT/'evidence/browser-review.json').read_text());check('Real browser evidence files and fingerprints',len(b['checks'])==22 and all(x['pass'] and sha(ROOT/x['path'])==x['sha256'] for x in b['checks']),'evidence/browser-review.json + original DOM/PNG/trace')
t=json.loads((ROOT/'evidence/raw/controller-final-timeline-audit.json').read_text());check('Two-process revocation next media request with PubSub absent',len(t['results'])==2 and all(x['all_checks'] for x in t['results']) and t['source_sha256']==sha(ROOT/t['source']),'final-fix-full-campaign/task5-commit-timeline.jsonl; independently audited same-clock causal sequence')
fault=json.loads((ROOT/'evidence/fault-summary.json').read_text());check('Redis/DB timeout/disconnect/reconnect no fault allow',len(fault['phases'])==14 and sum(x['count'] for x in fault['phases'])==224 and all(x['all_expected_actual_equal'] and x['all_fault_payloads_empty'] for x in fault['phases']),'evidence/fault-summary.json; frozen source raw functional observations')
perf=json.loads((ROOT/'evidence/performance-summary.json').read_text());windows=perf['windows'];check('Four measured resource-capped hot/cold 50client600s windows; faults/denials separate',len(windows)==4 and all(not w.get('incomplete') and w['runtime']['resource_gate'] and w['runtime']['data_scale_gate'] and w['audit']['actual_wall_ms']>=600000 and w['audit']['observed_client_count']==50 and not w['audit']['audit_errors'] for w in windows) and len(perf['denialFaultShortWindows'])==8,'evidence/performance-summary.json, every raw request audited; short fault/denial windows explicitly limited')
check('Original gates not relaxed; performance fails produceNoGo',all(not w['gate']['all_measured_windows_pass'] for w in windows) and 'No-Go' in report and '50 ms' in report and '500 ms' in report and '2000 ms' in report,'04§9.5 vs12§7 and raw threshold audit')
check('Native/Casbin ADR, risk/estimate and human signature not forged',all(s in adr for s in ['Native','Casbin','No-Go','2～4']) and all(s in report for s in ['273～433','待用户实际评审签署，未代签','当前实际被替代的正式工作项：无','折抵：0']),'03/12§9/11;03/13;docs/reuse-candidates.md')
check('Five permanent gaps /seven recitations /four minimal /two accepted risks /B4sequence',all(x in report for x in ['G-01','G-02','G-04','G-05','G-06','AC-N-03','AC-E-01','AC-E-02','AC-E-03','AC-E-22','AC-N-11','AC-E-25','固定表单','单级固定审批','课程无审核','北森','站内通知','人工维护','B4-16','B4-14','T-10 由我方定义','D-42 由我方定义']),'03/12§10')
check('No measured application code changes after final review',not subprocess.check_output(['git','diff','cb72484','--','src','sql','web'],text=True),'git diff cb72484 -- src sql web')
v=json.loads((ROOT/'evidence/final-verdict.json').read_text());check('FormalB1 remains unstarted/reuse0/human unsigned',v['gate']=='NO_GO' and not v['formal_B1_started'] and v['prototype_reuse_credit']==0 and v['human_signature'] is None,'evidence/final-verdict.json; no authorization to bypass failed gates')
result={'at':datetime.now().astimezone().isoformat(),'delivery_verified':all(x['verified'] for x in checks),'permission_gate':'NO_GO','checks':checks,'limits':'Verifies delivery/evidence integrity and preserves failed gates; does not change any failed performance point or certify production capacity. Human business signature remains pending.'}
(ROOT/'evidence/raw/controller-delivery-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'delivery_verified':result['delivery_verified'],'checks':len(checks),'failures':[x for x in checks if not x['verified']]},ensure_ascii=False,indent=2))
assert result['delivery_verified']
