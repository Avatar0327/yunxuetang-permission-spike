# 实测矩阵证据映射

`evidence/coverage-map.json` 使用 `docs/acceptance-manifest.json` 的全部168个子项，ID不改名、不省略。此文件由执行者填写、controller逐项审核，不从测试总数自动推断覆盖。

顶层包含 `sourceCommit`、`updatedAt`、`items`。每个item包含：

- `id`：冻结清单ID。
- `status`：`pass`、`fail`、`incomplete`之一；没有事实依据时保持incomplete。
- `actualResult`：实际观察结果及边界，明确哪些候选已测；不写计划时态冒充结果。
- `evidence`：引用数组，每条包含`kind`、`candidate`、`path`，可另有`line`、`observationName`和说明。路径相对原型根目录。

kind可用`http_sql`、`domain_sql`、`fault`、`browser`、`benchmark`、`boundary`、`unit`、`review`。candidate用`native`、`casbin`或`shared`，共享静态约束/前端证据须注明理由。纯unit/review不能把需要运行证据的子项填写通过。

JSONL引用指定1起始行号；若该行存在expected/actual则由controller脚本重新比较。保留修复前失败文件，但通过行应引用明确的修复后证据。原始记录若用name则observationName匹配name；其他格式应在说明中点明字段。截图/SQL计划/终端输出允许引用完整文件，controller仍须检查内容，文件存在不等于已证明要求。

`tools/audit-coverage.py`只核对ID、路径、已引用字面值和证据种类，不能判断证据是否足以证明对应语义。controller必须独立做该判断。不能用这份机械核验替代168项实测审计、性能门槛或最终Go签字。

`tools/index-observations.py`可生成带文件SHA与行号的原始观察索引，输出到`evidence/raw/controller-observation-index.json`。索引包含历史失败尝试；literalEqual不能自动变成覆盖通过，必须选择对应已审实现的证据并检查语义。
