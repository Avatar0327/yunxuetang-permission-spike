"""Render independently recomputed reference stats; never turn missing evidence into pass."""
from pathlib import Path
from collections import Counter
import json,sys
ROOT=Path(__file__).resolve().parents[1]
campaign=Path(sys.argv[1]).resolve()
windows=[]
for candidate in ['native','casbin']:
 for cache in ['hot','cold']:
  d=campaign/f'{candidate}-{cache}'
  if not (d/'independent-audit.json').exists():
   windows.append({'candidate':candidate,'cache':cache,'incomplete':True,'path':str(d.relative_to(ROOT))});continue
  audit=json.loads((d/'independent-audit.json').read_text())[0]
  gate=json.loads((d/'measured-window-gate.json').read_text())
  runtime=json.loads((d/'runtime-check.json').read_text())
  windows.append({'candidate':candidate,'cache':cache,'path':str(d.relative_to(ROOT)),'audit':audit,'gate':gate,'runtime':runtime})
phases=[]
for filename in ['task5-benchmark-independent-audit.json','task5-phase-cold-independent-audit.json']:
 for r in json.loads((ROOT/'evidence/raw'/filename).read_text()):
  if r['phase']!='success':phases.append(r)
summary={'campaign':str(campaign.relative_to(ROOT)),'sourceCommit':(campaign/'source-commit.txt').read_text().strip(),'windows':windows,'denialFaultShortWindows':phases,'overallGoInferred':False,'provisioningAttempts':json.loads((campaign/'retry-history.json').read_text()) if (campaign/'retry-history.json').exists() else None}
(ROOT/'evidence/performance-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
f=lambda n:'—' if n is None else f'{n:.2f}'
md=['# 权限预研性能实测','','以下正常窗口固定50个客户端、600秒、两API实例各2CPU/4GiB、PG4CPU/8GiB、Redis1CPU/1GiB。每窗重新seed，四种查询轮转且分场景统计；不是每个场景各50并发。所有HTTP200逐次比对完整count、行数、字段和结果摘要；拒绝、故障和测量错误均不计成功性能。','','冷指授权L1/L2快照未命中；数据库页缓存没有重置。主机同机Colima实验不证明生产跨机网络、1万人在学或OSS/CDN容量。源码提交：`'+summary['sourceCommit']+'`。','','## 正常参考窗口','','| 候选/缓存 | 实际持续秒 | 实际客户端 | 样本 | 分类计数 | 缓存实测 | 独立审计错误 | 门槛 |','|---|---:|---:|---:|---|---|---:|---|']
for w in windows:
 if w.get('incomplete'):
  md.append(f"| {w['candidate']}/{w['cache']} | — | — | — | 未完成 | — | — | No-Go |")
  continue
 a=w['audit'];md.append(f"| {w['candidate']}/{w['cache']} | {a['actual_wall_ms']/1000:.2f} | {a['observed_client_count']} | {a['sample_count']} | {json.dumps(a['categories'])} | {json.dumps(a['cache_states'])} | {len(a['audit_errors'])} | {'通过' if w['gate']['all_measured_windows_pass'] else '未通过'} |")
md+=['','## 各场景成功样本（毫秒）','','| 候选/缓存 | 场景 | 成功数 | 权限p50/p95/p99 | 含权限/过滤/count的HTTP p50/p95/p99 | 权限≤50 / HTTP门槛 |','|---|---|---:|---|---|---|']
for w in windows:
 if w.get('incomplete'):continue
 a=w['audit']
 for scenario in ['list-broad','list-constrained','history-broad','history-constrained']:
  s=a['statistics'].get(scenario,{});p=s.get('permission',{});t=s.get('success',{});g=a['threshold_observations'].get(scenario,{})
  md.append(f"| {w['candidate']}/{w['cache']} | {scenario} | {t.get('count',0)} | {' / '.join(f(p.get(k)) for k in ['p50','p95','p99'])} | {' / '.join(f(t.get(k)) for k in ['p50','p95','p99'])} | {g.get('permission_met',False)} / {g.get('success_met',False)}（{g.get('success_limit_ms','?')}） |")
md+=['','权限耗时包括token/权威DB、池等待、Redis检查、快照读取/构建、范围解析和SQL计划生成。HTTP时延包括数据/count和响应。每个场景均独立判门槛，不使用全场混合p95掩盖最复杂范围。原始样本、完整真值、资源配置、起止时刻、每种SQL查询次数和失败原因见performance-summary.json对应的窗口路径。','','## 拒绝和Redis故障短窗口（单列，不是参考查询性能）','','这些窗口在宿主Node进程运行，4客户端、2秒；没有冒充2CPU/4GiB的600秒正常窗口。冷热表示配置的授权缓存模式；拒绝/故障没有成功命中可用于推断缓存。','','| 候选/配置缓存 | 类别 | 样本 | p50/p95/p99毫秒 | 实际HTTP分类 |','|---|---|---:|---|---|']
for a in phases:
 s=a['statistics']['_all']['failure' if a['phase']=='fault' else a['phase']]
 md.append(f"| {a['candidate']}/{a['cache']} | {a['phase']} | {a['sample_count']} | {' / '.join(f(s.get(k)) for k in ['p50','p95','p99'])} | {json.dumps(a['categories'])} |")
md+=['','短窗拒绝为403、故障为503，样本中的count/rowCount为空；计时文件没有保存完整错误响应，不能仅凭这些计时字段断言所有业务字段为空。完整故障载荷保护另由最终冻结源码的16路径故障功能测试逐项验证，见fault-timeline.md。短窗没有正常成功样本，故不计算正常权限或查询达标率。','','## SQL与规模','','实际主租户50000人、第二租户500人、2000部门、20层、20角色、复杂操作者3成员关系、1000000条负载历史事实。复杂身份为非超管，3来源含角色内覆盖、交叠范围和局部原值字段；公司上限I/A，最终22875人、457673事实，真值由独立seed算式核对。','','真实EXPLAIN/参数位于raw/task5-explain。普通列表包含两条数据SQL（count+rows）；聚合一条数据SQL；权限公共调用另计。页20/50/200各14次查询，不随页行数增长；见raw/task5-complex-native.json与casbin.json。大历史授权关系携带约646KB/420KB的JSON参数和23062/15000人集合，潜在CPU/解析/传输/规划成本需结合本次负载结果定位；单次EXPLAIN时间不是并发p95。','']
md += ['','## 正常参考窗口错误率','','非成功率包含failure、denial、authorization_error和measurement_error；授权错误数独立列出，不把503误记为授权成功，也不把故障快速拒绝计入正常时延。完整结果真值差异针对每个HTTP200的count、行数、字段及摘要。','','| 候选/缓存 | 总请求 | 成功 | failure | denial | 授权错误 | 测量错误 | 非成功率 | HTTP200真值差异 |','|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for w in windows:
 if w.get('incomplete'):continue
 a=w['audit'];c=a['categories'];n=a['sample_count'];rate=(n-c.get('success',0))/n*100 if n else 100
 md.append(f"| {w['candidate']}/{w['cache']} | {n} | {c.get('success',0)} | {c.get('failure',0)} | {c.get('denial',0)} | {c.get('authorization_error',0)} | {c.get('measurement_error',0)} | {rate:.2f}% | {sum(a.get('raw_correctness_mismatches',{}).values())} |")
md += ['', '## 数据准备失败与补跑', '', 'Casbin冷缓存在测量前两次seed触发10秒SQL超时（57014）。两次失败原件、第三次只将宿主seed会话设为60秒的脚本和履历在参考目录保留。原SQL/数据、被测Docker API的10秒SQL超时、CPU/内存、50客户端/600秒及门槛不变；初始化不计入请求统计。详见retry-history.json。', '']
(ROOT/'evidence/performance-statistics.md').write_text('\n'.join(md))
print(json.dumps({'windows':len(windows),'completed':sum(not w.get('incomplete') for w in windows),'all_reference_windows_pass':all(not w.get('incomplete') and w['gate']['all_measured_windows_pass'] for w in windows),'output':'evidence/performance-statistics.md'},ensure_ascii=False))
