"""Offline recorded-case tests; requires archived candidate1 cold forensics fixture.
Run: python3 test/native-transport-audit.test.py (no database or API access).
"""
import copy, importlib.util, json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('native_audit',ROOT/'tools/audit-native-attribution.py')
audit=importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
FIXTURE=json.loads((ROOT/'evidence/raw/native-remediation-candidate1/cold/forensics/cold-transport-forensics.json').read_text())

class TransportAudit(unittest.TestCase):
 def case(self, rid='3cce359f-0836-4d18-998a-a08bb568307b'):
  case=copy.deepcopy(FIXTURE['requests'][rid]);client=case['client']['record']
  records=case['serverRecords'];trace=next(x for x in records if x['record']['type']=='request_diagnostic')
  events=[x for x in records if x['record']['type']=='request_transport_abort']
  return client,trace['record'],events,{'file':trace['file'],'line':trace['line1Based']}
 def validate(self,args):
  r,d,events,location=args
  # Tests supply independent known routing, never derive expectations from mutated data.
  original=FIXTURE['requests'][r['requestId']]['client']['record']
  expected='A'if(original['requestIndex']//4)%2==0 else'B'
  return audit.audit_transport(r,d,events,location,expected,original['instanceUrl'])
 def test_recorded_seven_cases(self):
  results=[self.validate(self.case(rid))for rid in FIXTURE['requests']]
  for r in results:self.assertEqual(r['issues'],[])
  self.assertEqual(sum(r['serverBoundaryCode']=='57014'for r in results),3)
  self.assertEqual(sum(r['serverBoundaryCode'] is None for r in results),4)
  self.assertEqual(sum(bool(r['abortEvents'])for r in results),6)
  self.assertTrue(all(r['observedSqlCount']==15 and r['clientQueryCount'] is None for r in results))
  self.assertTrue(all(r['queryCountComparison']=='unavailable_client_metadata'for r in results))
 def test_corrupt_evidence_is_rejected(self):
  cases={
   'wrong identity':lambda r,d,e,l:d.update(requestId='foreign-id'),
   'wrong route':lambda r,d,e,l:d.update(instance='A'),
   'missing abort':lambda r,d,e,l:e.clear(),
   'duplicate abort':lambda r,d,e,l:e.append(copy.deepcopy(e[0])),
   'foreign abort':lambda r,d,e,l:e[0]['record'].update(requestId='foreign-id'),
   'abort after final':lambda r,d,e,l:e[0]['record'].update(elapsedMs=d['elapsedMs']+1),
   'abort wrong line order':lambda r,d,e,l:l.update(line=e[0]['line1Based']-1),
   'no SQL evidence':lambda r,d,e,l:[s.update(name='unrecognized') for s in d['spans'] if s['name']=='sql.roundtrip'],
   'missing returned rows':lambda r,d,e,l:d['spans'][54].pop('returnedRows'),
   'unfinished SQL':lambda r,d,e,l:d['spans'][54].update(durationMs=0),
   'child outside parent':lambda r,d,e,l:d['spans'][54].update(durationMs=d['elapsedMs']+1),
   'ancestry cycle':lambda r,d,e,l:d['spans'][54].update(parentId=54),
   'unknown original error':lambda r,d,e,l:d['errors'].append({'phase':'sql.roundtrip','code':'UNKNOWN','name':'Error'}),
   'wrong failure phase':lambda r,d,e,l:r.update(failurePhase='body'),
   'invented echo':lambda r,d,e,l:r.update(serverRequestId=r['requestId']),
   'invented client queryCount':lambda r,d,e,l:r.update(queryCount=15),
   'premature timeout':lambda r,d,e,l:r.update(headersMs=300,elapsedMs=301),
   'dropped spans':lambda r,d,e,l:d.update(droppedSpans=1),
  }
  for name,mutate in cases.items():
   with self.subTest(name=name):
    args=self.case();mutate(*args);self.assertTrue(self.validate(args)['issues'])
 def test_completed_response_needs_actual_cancel_chain(self):
  args=self.case('ef44c252-00fd-4026-affd-ff52b1b0bcab')
  args[1]['errors']=[]
  self.assertTrue(self.validate(args)['issues'])
 def test_cancel_cannot_be_inferred_from_duration(self):
  result=self.validate(self.case('ccd7e312-8835-410a-b5d6-8b4037979f5f'))
  self.assertGreater(result['terminalSql']['durationMs'],10000)
  self.assertIsNone(result['serverBoundaryCode'])

if __name__=='__main__':unittest.main()
