"""Explicit per-subcase citations; never infer acceptance from names or test totals."""
import json,re,subprocess,datetime
from pathlib import Path
sources=['task5-final-task3.jsonl','task5-final-task4.jsonl','task5-final4-task5.jsonl','task5-ticket-final.jsonl','task5-export-scan-final.jsonl','task5-node-final.jsonl','task5-transfer-final.jsonl']
records=[]
for filename in sources:
 p=Path('evidence/raw')/filename
 for line,text in enumerate(p.read_text().splitlines(),1):
  r=json.loads(text)
  if 'expected' in r and r['expected']!=r.get('actual'):raise SystemExit(f'not final green: {p}:{line}')
  records.append((str(p),line,r))
# Ordered exact requirement selectors, reviewed individually; regex only selects citations.
selectors={
1:['T01 one membership simultaneous']*4,
2:['HTTP six scope all','HTTP six scope ownDeptSubtree','HTTP six scope ownDept$','HTTP six scope specified no subtree','HTTP six scope specified subtree','HTTP six scope managed','HTTP SELF real own object','empty scope missing-department|empty scope missing-subtree','empty scope missing-jurisdiction','unregistered course department scope'],
3:['HTTP role-local override','T03 same-node','same-row raw fields|nonmatching source field'],
4:['HTTP six scope managed','HTTP role-local override','HTTP role-local override','T04 empty override','T04 deleted override','fresh membership has new ID and no old override'],
5:['team includes direct A and cross-department B','team denies C','team denies E','HTTP six scope ownDeptSubtree'],
6:['T06 initial learner','T06 P appointment training whitelist','T06 P appointment training whitelist','T06 P list count','T06 P detail positive','T06 P save','T06 P export positive','T06 other module negative','T06 Q detail negative','T06 revoke P preserves Q','T06 last revoke closes backend','T06 lawful independent role','NEVER_BROWSER'],
7:['AUTH-T07-01','AUTH-T07-02','AUTH-T07-03','AUTH-T07-04','AUTH-T07-05','AUTH-T07-06','AUTH-T07-07','AUTH-T07-08'],
8:['AUTH-T08 knowledge.course.browse','AUTH-T08 knowledge.course.maintain','AUTH-T08 knowledge.course.distribute','AUTH-T08 knowledge.course.download|AUTH-T08 protected bytes','AUTH-T08 browse never downloads','AUTH-T08 current unpublish denies'],
9:['AUTH-T09 locked direct|AUTH-T09 forced child write','AUTH-T09 locked direct','AUTH-T09 locked direct','AUTH-T09 locked import','AUTH-T09 custom retains|AUTH-T09 old browse replaced','AUTH-T09 locked custom','AUTH-T09 parent retains original allow','AUTH-T08 knowledge.course.browse','AUTH-T09 depth10|AUTH-T09 depth11'],
10:['safe raw error B','safe raw error unknown','safe raw error other-1|same-name other tenant absent','denial random and foreign indistinguishable','NEVER_BROWSER'],
11:['switch off denies team','team includes direct|team denies C|team denies E','appointment remains independent'],
12:['same-row raw fields|nonmatching source field','raw field sentinel scan list','raw field sentinel scan detail','raw field sentinel scan export|account raw export|project raw export','raw application stdout stderr scan','raw Redis snapshot sentinel scan','raw field sentinel scan denial'],
13:['HTTP shrink before pagination count','HTTP shrink before pagination count','history aggregate new fact|history-constrained complete','HTTP same-action export cannot borrow|legacy account export complete','A manager search does not return|raw field sentinel scan search'],
14:['clear current manager and change job|move and clear never rewrite','cleared manager removes direct-team authority','current mutation.*enabled.*false|disabled target removes team authority','current mutation.*deleted.*true','current mutation.*deleted.*false|explicit recheck after restore','physical snapshot immutable|history snapshots unchanged','current state selects historical row'],
15:['sole writer exact revision transaction','B actual L1 and retained L2','sole writer exact revision transaction','sole writer exact revision transaction','sole writer exact revision transaction','sole writer exact revision transaction','sole writer exact revision transaction'],
16:['Redis disconnected warm','Redis timeout warm','Redis disconnected cold restarted process','Redis reconnected current authority','DB authority unavailable','Redis disconnected warm|DB authority unavailable','Redis disconnected warm|DB authority unavailable'],
17:['Guard bypass direct','export create HTTP|report export create','revoked revision invalidates.*execute','revoked revision invalidates.*claim','worker credential cannot|worker cannot|limited worker actual'],
18:['Task4 exact valid scale','Task4 same-name tenant interference 500','Task4 exact valid scale','NEVER_DEPTH','Task4 depth 21','Task4 cycle','complex actor actual non-ALL','Task4 exact valid scale','NEVER_REFERENCE','NEVER_REFERENCE','NEVER_REFERENCE','NEVER_REFERENCE','history-constrained complete','NEVER_PHASE_DENIAL','NEVER_PHASE_FAULT','page-independent query count','NEVER_SQL','NEVER_SQL','NEVER_REFERENCE','NEVER_CAPS'],
19:['batch delegation before later revoke|batch saves before later revoke','revoke committed before waiting batch denies','ordered batch delegation revoke wins','download chunk waits behind revoke','old signed ticket after revoke','NEVER_CORE_RACE'],
20:['AUTH-T20-01 populated B branch move|AUTH-T20-01 no unchecked expansion','AUTH-T20 source shrink edit','AUTH-T20 freeze committed|AUTH-T20 populated move freeze','AUTH-T20 explicit safe recheck','AUTH-T20 exceeds source suspended','AUTH-T20 audit states'],
21:['valid company-qualified appointed roster X','valid company-qualified appointed roster Y','ordinary customer has no project roster','internal owns plus explicit A B','shared content remains accessible','valid company-qualified appointed roster','A manager search does not return','manager own-company progress|manager hidden progress','own-company protected attachment|manager hidden attachment','project export company A only|export captured enrollment name','whole project cannot hide affected A|all affected companies positive'],
22:['explicit grant customer A','next request retains I B only','next request retains I B only','transfer explicit both-company|old enrollment keeps captured name','transfer history data company retained','new company SELF cannot read old company history|new company cannot acquire old enrollment'],
23:['own wallet separates A and B','B reward cannot offset A debt','new company SELF cannot read old company history','own wallet cannot unlock cross-company source','account export company A only|account export uses stable person company cap'],
24:['AUTH-T24 appointment never serves selected membership|AUTH-T07-07 cannot borrow','AUTH-T07-07 cannot borrow|company mutation cannot borrow','AUTH-T24 old dependency never revives|original-source history revoke freezes derived','AUTH-T24 recreated source|restored source explicit recheck active','fresh membership has new ID and no old override']}
manifest=json.loads(Path('docs/acceptance-manifest.json').read_text());items=[];uncited=[]
controller={'AUTH-T06-13','AUTH-T10-05',*[f'AUTH-T18-{n:02}' for n in [9,10,11,12,13,19,20]]}
for g in manifest['groups']:
 number=int(g['id'][-2:]);patterns=selectors[number]
 assert len(patterns)==len(g['required_subcases']),(g['id'],len(patterns))
 for point,pattern in zip(g['required_subcases'],patterns):
  refs=[];observed=[]
  for path,line,r in records:
   if re.search(pattern,r.get('name','')):
    kind='fault' if number in [15,16,19] else 'http_sql'
    refs.append(dict(kind=kind,candidate=r['candidate'],path=path,line=line,observationName=r['name']))
    if r['name'] not in observed:observed.append(r['name'])
  if not refs:uncited.append(point['id'])
  items.append(dict(id=point['id'],requirement=point['requirement'],status='incomplete',actualResult=('Controller browser/reference/deployment execution remains unmeasured. ' if point['id'] in controller else '')+('Native/Casbin runtime observations: '+ '; '.join(observed)+'. ' if refs else 'No matching runtime citation in this generator; see explicit supplemental evidence or missing list. ')+'Focused runtime evidence is supplied for independent per-ID semantic review; this status never follows test/name counts.',evidence=refs))
# Named non-HTTP artifacts are explicitly added, retaining incomplete status.
byid={i['id']:i for i in items}
def add(id,kind,path,candidate='shared',note=''):
 if path.endswith('.jsonl'):
  for line,text in enumerate(Path(path).read_text().splitlines(),1):
   r=json.loads(text)
   if id=='AUTH-T19-06' and r.get('name')!='snapshot-build-revoke':continue
   if id=='AUTH-T19-01' and r.get('name')!='write-revoke-order':continue
   byid[id]['evidence'].append(dict(kind=kind,candidate=r.get('candidate',candidate),path=path,line=line,observationName=r.get('name'),description=note))
 else:byid[id]['evidence'].append(dict(kind=kind,candidate=candidate,path=path,description=note))
for c in ['native','casbin']:
 for name in ['list-broad','list-constrained','history-broad','history-constrained']:
  for id in ['AUTH-T18-17','AUTH-T18-18']:add(id,'domain_sql',f'evidence/raw/task5-explain/{c}-{name}.json',c,'Actual ReportService endpoint queries and bound parameters; EXPLAIN ANALYZE BUFFERS, not simplified shape.')
 for phase,n in [('denial',14),('fault',15)]:add(f'AUTH-T18-{n:02}','benchmark',f'evidence/raw/task5-phase-{c}-{phase}/summary.json',c,'2-second4-client separate phase only, not normal/reference SLA evidence.')
 for phase,n in [('denial',14),('fault',15)]:add(f'AUTH-T18-{n:02}','benchmark',f'evidence/raw/task5-phase-cold-{c}-{phase}/summary.json',c,'Cold-configured2-second4-client separate phase; no successful authorized cache-state claim is inferred from denied/503 samples.')
 for id in ['AUTH-T12-04','AUTH-T12-05','AUTH-T21-10','AUTH-T23-05']:add(id,'http_sql',f'evidence/raw/task5-domain-export-scans-{c}.json',c,'Raw project/account claims, persistedchunks, boundedlegacy pages and processlogs; source/destination scope literal checks in JSONL.')
 for id in ['AUTH-T12-04','AUTH-T12-05','AUTH-T12-06','AUTH-T12-07']:add(id,'http_sql',f'evidence/raw/task5-scans-{c}.json',c,'Full captured raw surfaces/cache values/process stdout+stderr; sentinel assertions in JSONL.')
for id in [f'AUTH-T15-{n:02}' for n in range(1,8)]:add(id,'fault','evidence/raw/task5-final4-timeline.jsonl',note='Exact PG commit xmin/revision and DB-clock observation vs separate host-clock causal boundaries; both candidates.')
add('AUTH-T19-01','domain_sql','evidence/raw/task5-final-races.jsonl',note='Real ordered project save before revoke; title preserved and subsequent status403.')
add('AUTH-T19-06','domain_sql','evidence/raw/task5-final-races.jsonl',note='Named snapshot-build-revoke record, expectedStatus503; historical core in-flight tests do not claim every new request after commit.')
add('AUTH-T18-04','domain_sql','evidence/raw/task5-scale.json',note='Actual recursive max depth and literal scale/role/membership counts.')
for id in controller:
 byid[id]['actualResult']='INCOMPLETE: controller actual browser, 50-client600-second reference windows and/or capped-deployment evidence required. '+byid[id]['actualResult']
result=dict(sourceCommit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),boundary='Application working-tree runtime campaign; source commit will be updated to scoped implementation commit before final evidence commit. All168 acceptance statuses await independent semantic audit, not inferred from citation matching.',items=items)
Path('evidence/coverage-map.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
missing=[i['id'] for i in items if not i['evidence']]
Path('evidence/raw/task5-coverage-citation-gaps.json').write_text(json.dumps(dict(noEvidence=missing,controller=sorted(controller),note='A citation is not semantic coverage. Review individual requirements/actual results.'),indent=2)+'\n')
print(json.dumps(dict(items=len(items),noEvidence=missing),indent=2))
