# 原型复用候选与正式工作项

**当前实际替代的正式工作项：无。折抵合计：0人天。** 下表仅标出复用候选及可能替代的部分，不能因原型测试通过自动抵扣正式开发或验收执行。最终报告应列已审提交及剩余适配，不把合成Schema/会话/文件字节用于生产。

| 具体候选文件 | 可能替代的正式工作片段 | 仍需完成的适配与证据 | 当前折抵 |
|---|---|---|---:|
| src/authz/contracts.ts、policy.ts、scope.ts、registry.ts | B1-05三维授权、B1-07六范围、B1-08成员覆盖中的语义契约与纯计算 | 对接02正式Schema/节点字典、真实角色配置/变更入口，保留T-05/T-07/T-16边界并重跑正式集成 | 0 |
| src/authz/compiler.ts、src/organization/public.ts、src/contracts/ports.ts、src/report/public.ts | B1-07批量范围与SQL过滤；EST-ENG-01公开接口适配 | 正式仓储字段、当前投影一致性、各节点排序/聚合/字段能力与模块边界验收 | 0 |
| src/authz/revision.ts、cache.ts、src/infrastructure/db.ts | T-16权威版本、严格撤权与故障拒绝的协议骨架 | 正式登录/会话、迁移与审计、每个正式写入路径的锁序和故障验证；合成token不可复用为认证 | 0 |
| src/authz/role-service.ts、delegation-caps.ts、objects.ts | B1-06角色等级、B1-08覆盖关联及T-16来源冻结/重验的部分策略 | Task3四项与N1已限定复审通过；仍需完整正式配置UI、当前来源/目标集合与变更传播、较大集合的表示和性能验证 | 0 |
| src/knowledge/service.ts、public.ts | B2-01/02分类权限、继承、课程覆盖的部分契约和断言 | 正式课程/修订/附件模型、实际学习场景、合法配置UI；原型小分类集不能证明生产策略量性能 | 0 |
| src/training/service.ts、public.ts | B1-09对象任命及T-06派生后台/项目过滤的部分授权逻辑 | 正式项目生命周期、人员/轮次模型、真实后台操作与逐节点覆盖；未实现正式业务页面 | 0 |
| src/infrastructure/protected-exports.ts、src/report/exports.ts、src/training/exports.ts、src/account/exports.ts、src/authz/export-worker.ts | B2/B4项目名册、B5报表及账户导出的执行/领取重验片段 | 正式队列、任务持久恢复、输出保留/清理、存储适配与每批当前权限；租户revision/epoch保守失效的成本仍需产品集成验证 | 0 |
| src/authz/media-ticket.ts、src/training/service.ts中的媒体接口 | B3受控媒体请求的对象/身份/版本绑定契约 | 合成HMAC密钥和内存字节不是生产认证/OSS/CDN；密钥轮转、播放器和每分片实际网关须重验 | 0 |
| src/training/enrollment-service.ts及test/task5-enrollment-conflict.test.ts | T-07公司移籍后旧报名快照保护的部分断言 | 正式参与/轮次模型、移籍后新学习处理和全部任命/团队路径；不把冲突拒绝当完整报名产品 | 0 |
| test/semantic.test.ts、integration.test.ts、races.test.ts、review-regressions.test.ts、task3-*.test.ts | B6-01及各批次定向回归的部分真值和失败场景 | 替换合成夹具、正式HTTP/UI/数据库集成后重新执行；不能减少D-43裁定的52场景验收执行 | 0 |
| scripts/seed.ts、benchmark.ts、run-faults.ts、explain.ts及tools中的环境/证据脚本 | 权限回归、负载与故障复现脚手架 | 原型资源基准、真实生产拓扑/媒体/恢复另测；部署脚本和测试凭据不直接用于生产 | 0 |

上述工作有共同依赖，不能把各文件行分别算作新增或节省人天。T-05/T-07/T-16、工程底座与原B1估算仍按11分列；后续只对确实替代且已验收的同一工作片段扣一次。
