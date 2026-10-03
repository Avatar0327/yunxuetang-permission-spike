# Native 整改回归实测逐条记录

仅本次选定回归；不把旧矩阵未重跑项重新记为通过。源码 817256bf1e1fc722aaa5f0c21878e84fe8df1306。

| 行号 | 用例 | 字面预期 | 实际结果 | 判断 |
|---:|---|---|---|---|
| 1 | I1 first independent appointment | 200 | 200 | 通过 |
| 2 | I1 operator cannot authorize first relation | 403 | 403 | 通过 |
| 3 | I1 intended relation transport false | 200 | 200 | 通过 |
| 4 | I1 only intended natural key changes false | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": false}] | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": false}] | 通过 |
| 5 | I1 returned actual persisted ID | "ef851e78-5333-49e2-b4e5-91b81aac175a" | "ef851e78-5333-49e2-b4e5-91b81aac175a" | 通过 |
| 6 | I1 intended relation transport true | 200 | 200 | 通过 |
| 7 | I1 only intended natural key changes true | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": true}] | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": true}] | 通过 |
| 8 | I1 returned actual persisted ID | "ef851e78-5333-49e2-b4e5-91b81aac175a" | "ef851e78-5333-49e2-b4e5-91b81aac175a" | 通过 |
| 9 | I1 intended relation transport true | 200 | 200 | 通过 |
| 10 | I1 only intended natural key changes true | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": true}] | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": true}] | 通过 |
| 11 | I1 returned actual persisted ID | "ef851e78-5333-49e2-b4e5-91b81aac175a" | "ef851e78-5333-49e2-b4e5-91b81aac175a" | 通过 |
| 12 | I1 intended relation transport false | 200 | 200 | 通过 |
| 13 | I1 only intended natural key changes false | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": false}] | [{"person_id": "final-native-A-B", "project_id": "final-native-C", "active": true}, {"person_id": "final-native-A", "project_id": "B-final-native-C", "active": false}] | 通过 |
| 14 | I1 returned actual persisted ID | "ef851e78-5333-49e2-b4e5-91b81aac175a" | "ef851e78-5333-49e2-b4e5-91b81aac175a" | 通过 |
| 15 | I1 revoke first exact object | 403 | 403 | 通过 |
| 16 | I1 another appointment retained | 200 | 200 | 通过 |
| 17 | I1 surviving source backend | {"backend": true, "nodes": ["project"]} | {"backend": true, "nodes": ["project"]} | 通过 |
| 18 | I1 final revoke backend closes | {"backend": false, "nodes": []} | {"backend": false, "nodes": []} | 通过 |
| 19 | I2 mixed-case -project add | 200 | 200 | 通过 |
| 20 | I2 exact roster -project add | ["Z-final-sort-native", "a-final-sort-native"] | ["Z-final-sort-native", "a-final-sort-native"] | 通过 |
| 21 | I2 mixed-case -project remove | 200 | 200 | 通过 |
| 22 | I2 exact roster -project remove | [] | [] | 通过 |
| 23 | I2 mixed-case -team add | 200 | 200 | 通过 |
| 24 | I2 exact roster -team add | ["Z-final-sort-native", "a-final-sort-native"] | ["Z-final-sort-native", "a-final-sort-native"] | 通过 |
| 25 | I2 mixed-case -team remove | 200 | 200 | 通过 |
| 26 | I2 exact roster -team remove | [] | [] | 通过 |
| 27 | I2 denied full -project add X | 403 | 403 | 通过 |
| 28 | I2 unchanged full roster -project add X | [] | [] | 通过 |
| 29 | I2 denied full -project add missing | 403 | 403 | 通过 |
| 30 | I2 unchanged full roster -project add missing | [] | [] | 通过 |
| 31 | I2 denied full -project add Z-final-sort-native | 403 | 403 | 通过 |
| 32 | I2 unchanged full roster -project add Z-final-sort-native | [] | [] | 通过 |
| 33 | I2 denied full -project remove X | 403 | 403 | 通过 |
| 34 | I2 unchanged full roster -project remove X | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | 通过 |
| 35 | I2 denied full -project remove missing | 403 | 403 | 通过 |
| 36 | I2 unchanged full roster -project remove missing | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | 通过 |
| 37 | I2 denied full -project remove Z-final-sort-native | 403 | 403 | 通过 |
| 38 | I2 unchanged full roster -project remove Z-final-sort-native | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | 通过 |
| 39 | I2 denied full -team add X | 403 | 403 | 通过 |
| 40 | I2 unchanged full roster -team add X | [] | [] | 通过 |
| 41 | I2 denied full -team add missing | 403 | 403 | 通过 |
| 42 | I2 unchanged full roster -team add missing | [] | [] | 通过 |
| 43 | I2 denied full -team add Z-final-sort-native | 403 | 403 | 通过 |
| 44 | I2 unchanged full roster -team add Z-final-sort-native | [] | [] | 通过 |
| 45 | I2 denied full -team remove X | 403 | 403 | 通过 |
| 46 | I2 unchanged full roster -team remove X | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | 通过 |
| 47 | I2 denied full -team remove missing | 403 | 403 | 通过 |
| 48 | I2 unchanged full roster -team remove missing | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | 通过 |
| 49 | I2 denied full -team remove Z-final-sort-native | 403 | 403 | 通过 |
| 50 | I2 unchanged full roster -team remove Z-final-sort-native | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | [{"person_id": "a-final-sort-native", "company_id": "I", "snapshot_display_name": "a-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "Z-final-sort-native", "company_id": "I", "snapshot_display_name": "Z-final-sort-native", "progress": 0, "attachment": "synthetic-person-attachment"}] | 通过 |
| 51 | I2 department mixed-case authorized move | 200 | 200 | 通过 |
| 52 | I2 department exact stored parent | "a-dept-final-sort-native" | "a-dept-final-sort-native" | 通过 |
| 53 | I2 department incomplete child cap denied | 403 | 403 | 通过 |
| 54 | I2 department complete tree unchanged | [{"id": "a-dept-final-sort-native", "parent_id": null}, {"id": "b-dept-final-sort-native", "parent_id": "Z-dept-final-sort-native"}, {"id": "Z-dept-final-sort-native", "parent_id": "a-dept-final-sort-native"}] | [{"id": "a-dept-final-sort-native", "parent_id": null}, {"id": "b-dept-final-sort-native", "parent_id": "Z-dept-final-sort-native"}, {"id": "Z-dept-final-sort-native", "parent_id": "a-dept-final-sort-native"}] | 通过 |
| 55 | I3 configure inaccessible missing foreign same safe response | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | 通过 |
| 56 | I3 append-preview inaccessible missing foreign same safe response | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | 通过 |
| 57 | I3 append inaccessible missing foreign same safe response | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | 通过 |
| 58 | I3 import inaccessible missing foreign same safe response | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | 通过 |
| 59 | I3 recheck inaccessible missing foreign same safe response | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | [{"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}, {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}}] | 通过 |
| 60 | I3 missing parent business response | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | 通过 |
| 61 | I3 authorized configure retained | 200 | 200 | 通过 |
| 62 | I3 missing target batch safe response | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | 通过 |
| 63 | I3 import entire category unchanged | [{"tenant_id": "T1", "id": "final-category-native", "parent_id": null, "creator_id": "Z", "inherit_parent": false, "force_children": false, "grants": [], "college_id": "main", "source_id": "admin", "provenance": "active", "authority_snapshot": {"caps": [], "revision": 1791020890517, "sourceMembershipId": "admin"}}] | [{"tenant_id": "T1", "id": "final-category-native", "parent_id": null, "creator_id": "Z", "inherit_parent": false, "force_children": false, "grants": [], "college_id": "main", "source_id": "admin", "provenance": "active", "authority_snapshot": {"caps": [], "revision": 1791020890517, "sourceMembershipId": "admin"}}] | 通过 |
| 64 | I3 actual Redis timeout safe 503 | {"status": 503, "body": {"message": "服务暂不可用，请稍后重试"}} | {"status": 503, "body": {"message": "服务暂不可用，请稍后重试"}} | 通过 |
| 65 | I3 Redis recovery authorized configure | 200 | 200 | 通过 |
| 66 | 02 own company without extra grant | ["A", "B", "C", "D", "E", "M", "N"] | ["A", "B", "C", "D", "E", "M", "N"] | 通过 |
| 67 | 02 customer A absent grant | 403 | 403 | 通过 |
| 68 | delivery role create | 200 | 200 | 通过 |
| 69 | B warmed protected bytes | {"status": 200, "bytes": "synthetic-course-bytes"} | {"status": 200, "bytes": "synthetic-course-bytes"} | 通过 |
| 70 | download Redis timeout fails closed | {"status": 503, "bytes": null} | {"status": 503, "bytes": null} | 通过 |
| 71 | download after Redis recovery | 200 | 200 | 通过 |
| 72 | A revoke committed | 200 | 200 | 通过 |
| 73 | B next new download denies old L1/L2 | {"status": 403, "bytes": null, "pubsub": false, "afterCommit": true} | {"status": 403, "bytes": null, "pubsub": false, "afterCommit": true} | 通过 |
| 74 | category persistence | 200 | 200 | 通过 |
| 75 | role creation level2 | 200 | 200 | 通过 |
| 76 | populated source creation | 200 | 200 | 通过 |
| 77 | populated derived creation | 200 | 200 | 通过 |
| 78 | AUTH-T20-01 initial literal cap | ["A"] | ["A"] | 通过 |
| 79 | AUTH-T20-01 populated B branch move | 200 | 200 | 通过 |
| 80 | AUTH-T20-01 no unchecked expansion | {"state": "recheck_required", "cap": ["A"]} | {"state": "recheck_required", "cap": ["A"]} | 通过 |
| 81 | AUTH-T20-01 frozen parent cannot regrant | "suspended" | "suspended" | 通过 |
| 82 | AUTH-T20-01 explicit parent and child recheck | {"state": "active", "cap": ["A", "B"]} | {"state": "active", "cap": ["A", "B"]} | 通过 |
| 83 | company fixtures | [200, 200] | [200, 200] | 通过 |
| 84 | role recheck respects target company | 403 | 403 | 通过 |
| 85 | role edit respects target company | 403 | 403 | 通过 |
| 86 | shared content remains accessible X | 200 | 200 | 通过 |
| 87 | shared content remains accessible Y | 200 | 200 | 通过 |
| 88 | shared content remains accessible person-00001 | 200 | 200 | 通过 |
| 89 | ordinary customer has no project roster | 403 | 403 | 通过 |
| 90 | ordinary customer no management shell | {"backend": false, "nodes": []} | {"backend": false, "nodes": []} | 通过 |
| 91 | cannot grant cross-company range to external | 403 | 403 | 通过 |
| 92 | A manager search does not return A or hidden B | {"count": 0, "rows": []} | {"count": 0, "rows": []} | 通过 |
| 93 | valid company-qualified appointed roster X | {"ids": ["X"], "count": 1} | {"ids": ["X"], "count": 1} | 通过 |
| 94 | own-company protected attachment X | {"status": 200, "bytes": "attachment-X"} | {"status": 200, "bytes": "attachment-X"} | 通过 |
| 95 | valid company-qualified appointed roster Y | {"ids": ["Y"], "count": 1} | {"ids": ["Y"], "count": 1} | 通过 |
| 96 | own-company protected attachment Y | {"status": 200, "bytes": "attachment-Y"} | {"status": 200, "bytes": "attachment-Y"} | 通过 |
| 97 | B manager own-company progress | {"status": 200, "personId": "Y", "progress": 75} | {"status": 200, "personId": "Y", "progress": 75} | 通过 |
| 98 | A manager own-company progress | {"status": 200, "personId": "X", "progress": 25} | {"status": 200, "personId": "X", "progress": 25} | 通过 |
| 99 | X manager hidden progress | 403 | 403 | 通过 |
| 100 | X manager hidden attachment | 403 | 403 | 通过 |
| 101 | Y manager hidden progress | 403 | 403 | 通过 |
| 102 | Y manager hidden attachment | 403 | 403 | 通过 |
| 103 | explicit grant customer A | 200 | 200 | 通过 |
| 104 | explicit grant customer B | 200 | 200 | 通过 |
| 105 | internal owns plus explicit A B | ["A", "X", "Y"] | ["A", "X", "Y"] | 通过 |
| 106 | revoke A | 200 | 200 | 通过 |
| 107 | next request retains I B only | ["A", "Y"] | ["A", "Y"] | 通过 |
| 108 | whole project cannot hide affected A | 403 | 403 | 通过 |
| 109 | all affected companies positive | 200 | 200 | 通过 |
| 110 | current mutation {"enabled":false} | 200 | 200 | 通过 |
| 111 | current state selects historical row {"enabled":false} | [403, 200, 403] | [403, 200, 403] | 通过 |
| 112 | history snapshots unchanged {"enabled":false} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | 通过 |
| 113 | current mutation {"enabled":true,"deleted":true} | 200 | 200 | 通过 |
| 114 | current state selects historical row {"enabled":true,"deleted":true} | [403, 403, 200] | [403, 403, 200] | 通过 |
| 115 | history snapshots unchanged {"enabled":true,"deleted":true} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | 通过 |
| 116 | current mutation {"enabled":true,"deleted":false} | 200 | 200 | 通过 |
| 117 | current state selects historical row {"enabled":true,"deleted":false} | [200, 403, 403] | [200, 403, 403] | 通过 |
| 118 | history snapshots unchanged {"enabled":true,"deleted":false} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | 通过 |
| 119 | clear current manager and change job | 200 | 200 | 通过 |
| 120 | all current projections delivered atomically | {"department_id": null, "manager_id": null, "job_id": "current-new-job"} | {"department_id": null, "manager_id": null, "job_id": "current-new-job"} | 通过 |
| 121 | move and clear never rewrite historical fields | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | {"data_company_id": "I", "historical_department_id": "old-B-dept", "historical_job_id": "old-B-job", "historical_status": "enabled"} | 通过 |
| 122 | physical snapshot immutable | true | true | 通过 |
| 123 | transfer explicit both-company company/dept | 200 | 200 | 通过 |
| 124 | new company SELF cannot read old company history | ["h-X-B"] | ["h-X-B"] | 通过 |
| 125 | transfer history data company retained | ["A", "B"] | ["A", "B"] | 通过 |
| 126 | invalid relationship {"departmentId":"wide-1"} | 403 | 403 | 通过 |
| 127 | invalid relationship {"managerId":"B"} | 403 | 403 | 通过 |
| 128 | invalid relationship {"managerId":"other-1"} | 403 | 403 | 通过 |
| 129 | same-row raw fields A | ["phone-A", "email-A", "card-A"] | ["phone-A", "email-A", "card-A"] | 通过 |
| 130 | same-row raw fields B | [null, null, null] | [null, null, null] | 通过 |
| 131 | safe raw error B | false | false | 通过 |
| 132 | safe raw error unknown | false | false | 通过 |
| 133 | safe raw error other-1 | false | false | 通过 |
| 134 | denial random and foreign indistinguishable | [{"status": 403, "message": "你暂时不能查看或操作这项内容，请联系管理员确认权限", "rows": null}, {"status": 403, "message": "你暂时不能查看或操作这项内容，请联系管理员确认权限", "rows": null}, {"status": 403, "message": "你暂时不能查看或操作这项内容，请联系管理员确认权限", "rows": null}] | [{"status": 403, "message": "你暂时不能查看或操作这项内容，请联系管理员确认权限", "rows": null}, {"status": 403, "message": "你暂时不能查看或操作这项内容，请联系管理员确认权限", "rows": null}, {"status": 403, "message": "你暂时不能查看或操作这项内容，请联系管理员确认权限", "rows": null}] | 通过 |
| 135 | revoke committed before waiting batch denies | 403 | 403 | 通过 |
| 136 | waiting denied batch writes zero | 0 | 0 | 通过 |
| 137 | batch saves before later revoke | 200 | 200 | 通过 |
| 138 | next new remove sees committed revoke | 403 | 403 | 通过 |
| 139 | committed authorized batch retained | ["A", "B"] | ["A", "B"] | 通过 |
| 140 | two instances next request company revoke no pubsub | {"ids": ["A", "Y"], "pubsub": false, "afterCommit": true} | {"ids": ["A", "Y"], "pubsub": false, "afterCommit": true} | 通过 |
| 141 | warm own-account Redis failure has no balances | {"status": 503, "rows": null} | {"status": 503, "rows": null} | 通过 |
| 142 | recovered account uses current authority | 200 | 200 | 通过 |
| 143 | cold attachment Redis failure has no bytes | {"status": 503, "bytes": null} | {"status": 503, "bytes": null} | 通过 |
| 144 | history role for person without facts | 200 | 200 | 通过 |
| 145 | new same-company fact appears, other company denied | ["t4-history-native-same"] | ["t4-history-native-same"] | 通过 |
| 146 | history cap dimension and literal no-fact person/company | {"dimension": "person-company-v1", "ids": ["[\"L\",\"I\"]"]} | {"dimension": "person-company-v1", "ids": ["[\"L\",\"I\"]"]} | 通过 |
| 147 | history new fact detail | 200 | 200 | 通过 |
| 148 | history aggregate new fact | [{"historical_department_id": "new-history", "count": 1, "points": "1"}] | [{"historical_department_id": "new-history", "count": 1, "points": "1"}] | 通过 |
| 149 | history export shares person/company cap | ["t4-history-native-same"] | ["t4-history-native-same"] | 通过 |
| 150 | legacy or unknown fact-id cap fails closed undefined | 403 | 403 | 通过 |
| 151 | legacy or unknown fact-id cap fails closed unknown-dimension | 403 | 403 | 通过 |
| 152 | disabled history actor denied | 403 | 403 | 通过 |
| 153 | restoration retains source-change freeze | 403 | 403 | 通过 |
| 154 | explicit recheck after restore | "active" | "active" | 通过 |
| 155 | original-source history revoke freezes derived | 403 | 403 | 通过 |
| 156 | original-source missing history remains suspended | "suspended" | "suspended" | 通过 |
| 157 | restored source explicit recheck active | "active" | "active" | 通过 |
| 158 | company mutation cannot borrow admin range beyond selected L cap | 403 | 403 | 通过 |
| 159 | R1 prepare lawful department X | 200 | 200 | 通过 |
| 160 | R1 prepare lawful department Y | 200 | 200 | 通过 |
| 161 | R1 legitimate project appointment Y | 200 | 200 | 通过 |
| 162 | R1 legitimate project appointment M | 200 | 200 | 通过 |
| 163 | R1 legitimate project appointment person-00001 | 200 | 200 | 通过 |
| 164 | R1 transfer current X A to B | 200 | 200 | 通过 |
| 165 | R1 immutable original enrollment before attempted add | [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}] | [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}] | 通过 |
| 166 | R1 single safe denial and unchanged complete roster/revision/epoch | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}, "rows": [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}], "unchangedStamp": true} | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}, "rows": [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}], "unchangedStamp": true} | 通过 |
| 167 | R1 mixed safe denial and unchanged complete roster/revision/epoch | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}, "rows": [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}], "unchangedStamp": true} | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}, "rows": [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}], "unchangedStamp": true} | 通过 |
| 168 | R1 exact roster/count person-00001 | {"status": 200, "rows": [{"person_id": "X", "company_id": "A", "display_name": "X"}], "count": 1} | {"status": 200, "rows": [{"person_id": "X", "company_id": "A", "display_name": "X"}], "count": 1} | 通过 |
| 169 | R1 current B name absent from enrollment search person-00001 | {"status": 200, "rows": [], "count": 0} | {"status": 200, "rows": [], "count": 0} | 通过 |
| 170 | R1 old A progress boundary person-00001 | {"status": 200, "body": {"personId": "X", "progress": 25}} | {"status": 200, "body": {"personId": "X", "progress": 25}} | 通过 |
| 171 | R1 old A attachment boundary person-00001 | {"status": 200, "body": {"personId": "X", "bytes": "attachment-X"}} | {"status": 200, "body": {"personId": "X", "bytes": "attachment-X"}} | 通过 |
| 172 | R1 export create person-00001 | 200 | 200 | 通过 |
| 173 | R1 export execute person-00001 | 200 | 200 | 通过 |
| 174 | R1 exact export snapshot person-00001 | {"status": 200, "rows": [{"person_id": "X", "company_id": "A", "display_name": "X"}], "count": 1} | {"status": 200, "rows": [{"person_id": "X", "company_id": "A", "display_name": "X"}], "count": 1} | 通过 |
| 175 | R1 exact roster/count Y | {"status": 200, "rows": [{"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 1} | {"status": 200, "rows": [{"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 1} | 通过 |
| 176 | R1 current B name absent from enrollment search Y | {"status": 200, "rows": [], "count": 0} | {"status": 200, "rows": [], "count": 0} | 通过 |
| 177 | R1 old A progress boundary Y | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | 通过 |
| 178 | R1 old A attachment boundary Y | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | {"status": 403, "body": {"message": "你暂时不能查看或操作这项内容，请联系管理员确认权限"}} | 通过 |
| 179 | R1 export create Y | 200 | 200 | 通过 |
| 180 | R1 export execute Y | 200 | 200 | 通过 |
| 181 | R1 exact export snapshot Y | {"status": 200, "rows": [{"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 1} | {"status": 200, "rows": [{"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 1} | 通过 |
| 182 | R1 exact roster/count M | {"status": 200, "rows": [{"person_id": "A", "company_id": "I", "display_name": "A"}, {"person_id": "X", "company_id": "A", "display_name": "X"}, {"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 3} | {"status": 200, "rows": [{"person_id": "A", "company_id": "I", "display_name": "A"}, {"person_id": "X", "company_id": "A", "display_name": "X"}, {"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 3} | 通过 |
| 183 | R1 current B name absent from enrollment search M | {"status": 200, "rows": [], "count": 0} | {"status": 200, "rows": [], "count": 0} | 通过 |
| 184 | R1 old A progress boundary M | {"status": 200, "body": {"personId": "X", "progress": 25}} | {"status": 200, "body": {"personId": "X", "progress": 25}} | 通过 |
| 185 | R1 old A attachment boundary M | {"status": 200, "body": {"personId": "X", "bytes": "attachment-X"}} | {"status": 200, "body": {"personId": "X", "bytes": "attachment-X"}} | 通过 |
| 186 | R1 export create M | 200 | 200 | 通过 |
| 187 | R1 export execute M | 200 | 200 | 通过 |
| 188 | R1 exact export snapshot M | {"status": 200, "rows": [{"person_id": "A", "company_id": "I", "display_name": "A"}, {"person_id": "X", "company_id": "A", "display_name": "X"}, {"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 3} | {"status": 200, "rows": [{"person_id": "A", "company_id": "I", "display_name": "A"}, {"person_id": "X", "company_id": "A", "display_name": "X"}, {"person_id": "Y", "company_id": "B", "display_name": "Y"}], "count": 3} | 通过 |
| 189 | R1 same-company add response 0 | {"status": 200, "body": {"changed": true, "count": 2}} | {"status": 200, "body": {"changed": true, "count": 2}} | 通过 |
| 190 | R1 same-company add preserves existing snapshots/progress 0 | [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "W", "company_id": "B", "snapshot_display_name": "W", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}] | [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "W", "company_id": "B", "snapshot_display_name": "W", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}] | 通过 |
| 191 | R1 same-company add response 1 | {"status": 200, "body": {"changed": true, "count": 2}} | {"status": 200, "body": {"changed": true, "count": 2}} | 通过 |
| 192 | R1 same-company add preserves existing snapshots/progress 1 | [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "W", "company_id": "B", "snapshot_display_name": "W", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}] | [{"person_id": "A", "company_id": "I", "snapshot_display_name": "A", "progress": 50, "attachment": "attachment-A"}, {"person_id": "W", "company_id": "B", "snapshot_display_name": "W", "progress": 0, "attachment": "synthetic-person-attachment"}, {"person_id": "X", "company_id": "A", "snapshot_display_name": "X", "progress": 25, "attachment": "attachment-X"}, {"person_id": "Y", "company_id": "B", "snapshot_display_name": "Y", "progress": 75, "attachment": "attachment-Y"}] | 通过 |
| 193 | warm protected controls GET /report?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 194 | warm protected controls GET /history?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 195 | warm protected controls GET /projects/P/media/next | {"status": 200} | {"status": 200} | 通过 |
| 196 | warm protected controls GET /projects/P/people/A/attachment | {"status": 200} | {"status": 200} | 通过 |
| 197 | warm protected controls GET /courses/task5-media/download | {"status": 200} | {"status": 200} | 通过 |
| 198 | warm protected controls GET /account/own | {"status": 200} | {"status": 200} | 通过 |
| 199 | warm protected controls GET /account/export | {"status": 200} | {"status": 200} | 通过 |
| 200 | warm protected controls POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 201 | warm protected controls GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 200} | {"status": 200} | 通过 |
| 202 | warm protected controls POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 203 | warm protected controls POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 204 | warm protected controls GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 200} | {"status": 200} | 通过 |
| 205 | warm protected controls POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 206 | warm protected controls POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 207 | warm protected controls GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 200} | {"status": 200} | 通过 |
| 208 | warm protected controls POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 209 | Redis timeout warm GET /report?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 210 | Redis timeout warm GET /history?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 211 | Redis timeout warm GET /projects/P/media/next | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 212 | Redis timeout warm GET /projects/P/people/A/attachment | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 213 | Redis timeout warm GET /courses/task5-media/download | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 214 | Redis timeout warm GET /account/own | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 215 | Redis timeout warm GET /account/export | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 216 | Redis timeout warm POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 217 | Redis timeout warm GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 218 | Redis timeout warm POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 219 | Redis timeout warm POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 220 | Redis timeout warm GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 221 | Redis timeout warm POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 222 | Redis timeout warm POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 223 | Redis timeout warm GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 224 | Redis timeout warm POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 225 | Redis timeout cold restarted process GET /report?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 226 | Redis timeout cold restarted process GET /history?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 227 | Redis timeout cold restarted process GET /projects/P/media/next | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 228 | Redis timeout cold restarted process GET /projects/P/people/A/attachment | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 229 | Redis timeout cold restarted process GET /courses/task5-media/download | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 230 | Redis timeout cold restarted process GET /account/own | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 231 | Redis timeout cold restarted process GET /account/export | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 232 | Redis timeout cold restarted process POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 233 | Redis timeout cold restarted process GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 234 | Redis timeout cold restarted process POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 235 | Redis timeout cold restarted process POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 236 | Redis timeout cold restarted process GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 237 | Redis timeout cold restarted process POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 238 | Redis timeout cold restarted process POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 239 | Redis timeout cold restarted process GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 240 | Redis timeout cold restarted process POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 241 | Redis timeout recovery current authority GET /report?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 242 | Redis timeout recovery current authority GET /history?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 243 | Redis timeout recovery current authority GET /projects/P/media/next | {"status": 200} | {"status": 200} | 通过 |
| 244 | Redis timeout recovery current authority GET /projects/P/people/A/attachment | {"status": 200} | {"status": 200} | 通过 |
| 245 | Redis timeout recovery current authority GET /courses/task5-media/download | {"status": 200} | {"status": 200} | 通过 |
| 246 | Redis timeout recovery current authority GET /account/own | {"status": 200} | {"status": 200} | 通过 |
| 247 | Redis timeout recovery current authority GET /account/export | {"status": 200} | {"status": 200} | 通过 |
| 248 | Redis timeout recovery current authority POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 249 | Redis timeout recovery current authority GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 200} | {"status": 200} | 通过 |
| 250 | Redis timeout recovery current authority POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 251 | Redis timeout recovery current authority POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 252 | Redis timeout recovery current authority GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 200} | {"status": 200} | 通过 |
| 253 | Redis timeout recovery current authority POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 254 | Redis timeout recovery current authority POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 255 | Redis timeout recovery current authority GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 200} | {"status": 200} | 通过 |
| 256 | Redis timeout recovery current authority POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 257 | Redis timeout cold process recovery current authority GET /report?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 258 | Redis timeout cold process recovery current authority GET /history?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 259 | Redis timeout cold process recovery current authority GET /projects/P/media/next | {"status": 200} | {"status": 200} | 通过 |
| 260 | Redis timeout cold process recovery current authority GET /projects/P/people/A/attachment | {"status": 200} | {"status": 200} | 通过 |
| 261 | Redis timeout cold process recovery current authority GET /courses/task5-media/download | {"status": 200} | {"status": 200} | 通过 |
| 262 | Redis timeout cold process recovery current authority GET /account/own | {"status": 200} | {"status": 200} | 通过 |
| 263 | Redis timeout cold process recovery current authority GET /account/export | {"status": 200} | {"status": 200} | 通过 |
| 264 | Redis timeout cold process recovery current authority POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 265 | Redis timeout cold process recovery current authority GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 200} | {"status": 200} | 通过 |
| 266 | Redis timeout cold process recovery current authority POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 267 | Redis timeout cold process recovery current authority POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 268 | Redis timeout cold process recovery current authority GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 200} | {"status": 200} | 通过 |
| 269 | Redis timeout cold process recovery current authority POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 270 | Redis timeout cold process recovery current authority POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 271 | Redis timeout cold process recovery current authority GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 200} | {"status": 200} | 通过 |
| 272 | Redis timeout cold process recovery current authority POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 273 | Redis disconnected warm GET /report?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 274 | Redis disconnected warm GET /history?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 275 | Redis disconnected warm GET /projects/P/media/next | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 276 | Redis disconnected warm GET /projects/P/people/A/attachment | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 277 | Redis disconnected warm GET /courses/task5-media/download | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 278 | Redis disconnected warm GET /account/own | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 279 | Redis disconnected warm GET /account/export | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 280 | Redis disconnected warm POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 281 | Redis disconnected warm GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 282 | Redis disconnected warm POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 283 | Redis disconnected warm POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 284 | Redis disconnected warm GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 285 | Redis disconnected warm POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 286 | Redis disconnected warm POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 287 | Redis disconnected warm GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 288 | Redis disconnected warm POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 289 | Redis disconnected cold restarted process GET /report?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 290 | Redis disconnected cold restarted process GET /history?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 291 | Redis disconnected cold restarted process GET /projects/P/media/next | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 292 | Redis disconnected cold restarted process GET /projects/P/people/A/attachment | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 293 | Redis disconnected cold restarted process GET /courses/task5-media/download | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 294 | Redis disconnected cold restarted process GET /account/own | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 295 | Redis disconnected cold restarted process GET /account/export | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 296 | Redis disconnected cold restarted process POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 297 | Redis disconnected cold restarted process GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 298 | Redis disconnected cold restarted process POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 299 | Redis disconnected cold restarted process POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 300 | Redis disconnected cold restarted process GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 301 | Redis disconnected cold restarted process POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 302 | Redis disconnected cold restarted process POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 303 | Redis disconnected cold restarted process GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 304 | Redis disconnected cold restarted process POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 305 | Redis reconnected current authority GET /report?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 306 | Redis reconnected current authority GET /history?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 307 | Redis reconnected current authority GET /projects/P/media/next | {"status": 200} | {"status": 200} | 通过 |
| 308 | Redis reconnected current authority GET /projects/P/people/A/attachment | {"status": 200} | {"status": 200} | 通过 |
| 309 | Redis reconnected current authority GET /courses/task5-media/download | {"status": 200} | {"status": 200} | 通过 |
| 310 | Redis reconnected current authority GET /account/own | {"status": 200} | {"status": 200} | 通过 |
| 311 | Redis reconnected current authority GET /account/export | {"status": 200} | {"status": 200} | 通过 |
| 312 | Redis reconnected current authority POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 313 | Redis reconnected current authority GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 200} | {"status": 200} | 通过 |
| 314 | Redis reconnected current authority POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 315 | Redis reconnected current authority POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 316 | Redis reconnected current authority GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 200} | {"status": 200} | 通过 |
| 317 | Redis reconnected current authority POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 318 | Redis reconnected current authority POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 319 | Redis reconnected current authority GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 200} | {"status": 200} | 通过 |
| 320 | Redis reconnected current authority POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 321 | DB authority unavailable GET /report?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 322 | DB authority unavailable GET /history?fixture=true | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 323 | DB authority unavailable GET /projects/P/media/next | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 324 | DB authority unavailable GET /projects/P/people/A/attachment | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 325 | DB authority unavailable GET /courses/task5-media/download | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 326 | DB authority unavailable GET /account/own | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 327 | DB authority unavailable GET /account/export | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 328 | DB authority unavailable POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 329 | DB authority unavailable GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 330 | DB authority unavailable POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 331 | DB authority unavailable POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 332 | DB authority unavailable GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 333 | DB authority unavailable POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 334 | DB authority unavailable POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 335 | DB authority unavailable GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 336 | DB authority unavailable POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 503, "businessKeys": []} | {"status": 503, "businessKeys": []} | 通过 |
| 337 | DB recovered authoritative current state GET /report?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 338 | DB recovered authoritative current state GET /history?fixture=true | {"status": 200} | {"status": 200} | 通过 |
| 339 | DB recovered authoritative current state GET /projects/P/media/next | {"status": 200} | {"status": 200} | 通过 |
| 340 | DB recovered authoritative current state GET /projects/P/people/A/attachment | {"status": 200} | {"status": 200} | 通过 |
| 341 | DB recovered authoritative current state GET /courses/task5-media/download | {"status": 200} | {"status": 200} | 通过 |
| 342 | DB recovered authoritative current state GET /account/own | {"status": 200} | {"status": 200} | 通过 |
| 343 | DB recovered authoritative current state GET /account/export | {"status": 200} | {"status": 200} | 通过 |
| 344 | DB recovered authoritative current state POST /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 345 | DB recovered authoritative current state GET /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | {"status": 200} | {"status": 200} | 通过 |
| 346 | DB recovered authoritative current state POST /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | {"status": 200} | {"status": 200} | 通过 |
| 347 | DB recovered authoritative current state POST /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 348 | DB recovered authoritative current state GET /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | {"status": 200} | {"status": 200} | 通过 |
| 349 | DB recovered authoritative current state POST /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | {"status": 200} | {"status": 200} | 通过 |
| 350 | DB recovered authoritative current state POST /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 351 | DB recovered authoritative current state GET /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | {"status": 200} | {"status": 200} | 通过 |
| 352 | DB recovered authoritative current state POST /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | {"status": 200} | {"status": 200} | 通过 |
| 353 | B actual L1 and retained L2 before sole writer revoke | {"cache": "L1", "l2": 1} | {"cache": "L1", "l2": 1} | 通过 |
| 354 | sole writer exact revision transaction | {"delta": 1, "committed": true, "newXmin": true, "afterCommit": true, "afterAcknowledgment": true, "pubsub": false, "differentProcesses": true, "status": 403, "observedRevision": 1791020890767} | {"delta": 1, "committed": true, "newXmin": true, "afterCommit": true, "afterAcknowledgment": true, "pubsub": false, "differentProcesses": true, "status": 403, "observedRevision": 1791020890767} | 通过 |
| 355 | revoked revision invalidates report /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | 403 | 403 | 通过 |
| 356 | revoked revision invalidates report /exports/66a0f88d-d08a-4992-91df-2dd2becf7898/claim | 403 | 403 | 通过 |
| 357 | revoked revision invalidates report /worker/report/exports/66a0f88d-d08a-4992-91df-2dd2becf7898/execute | 403 | 403 | 通过 |
| 358 | revoked revision invalidates training /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | 403 | 403 | 通过 |
| 359 | revoked revision invalidates training /project-exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/claim | 403 | 403 | 通过 |
| 360 | revoked revision invalidates training /worker/training/exports/710f21fe-a01e-408f-bb9f-8879e60f7a5e/execute | 403 | 403 | 通过 |
| 361 | revoked revision invalidates account /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | 403 | 403 | 通过 |
| 362 | revoked revision invalidates account /account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/claim | 403 | 403 | 通过 |
| 363 | revoked revision invalidates account /worker/account/exports/e3491863-a364-4e4d-ab7d-ceea46d2988e/execute | 403 | 403 | 通过 |
| 364 | T06 initial learner no backend | {"backend": false, "nodes": []} | {"backend": false, "nodes": []} | 通过 |
| 365 | T06 P appointment training whitelist | {"backend": true, "nodes": ["project"]} | {"backend": true, "nodes": ["project"]} | 通过 |
| 366 | T06 P list count | {"ids": ["P"], "count": 1} | {"ids": ["P"], "count": 1} | 通过 |
| 367 | T06 P detail positive | 200 | 200 | 通过 |
| 368 | T06 P save with full affected-company cap | 200 | 200 | 通过 |
| 369 | T06 other module negative | 403 | 403 | 通过 |
| 370 | T06 Q detail negative | 403 | 403 | 通过 |
| 371 | T06 P export positive | ["A", "X", "Y"] | ["A", "X", "Y"] | 通过 |
| 372 | T06 revoke P preserves Q | ["Q"] | ["Q"] | 通过 |
| 373 | T06 revoked P next direct request | 403 | 403 | 通过 |
| 374 | T06 last revoke closes backend | {"backend": false, "nodes": []} | {"backend": false, "nodes": []} | 通过 |
| 375 | T06 lawful independent role navigation retained | {"backend": true, "nodes": ["personal-learning"]} | {"backend": true, "nodes": ["personal-learning"]} | 通过 |
| 376 | T06 lawful independent role data retained | ["L"] | ["L"] | 通过 |
| 377 | T03 same-node broad view t5-nav-native-own | 200 | 200 | 通过 |
| 378 | T03 same-node broad view t5-nav-native-other | 200 | 200 | 通过 |
| 379 | T03 same-node SELF edit positive | 200 | 200 | 通过 |
| 380 | T03 same-node cannot borrow broad view to edit other | 403 | 403 | 通过 |
| 381 | T03 denied other edit wrote nothing | "t5-nav-native-other" | "t5-nav-native-other" | 通过 |
| 382 | T01 one membership simultaneous two-node literal lists counts and same B direct ID A | {"all": {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7, "sources": ["role:t5-one-role-native:personal-learning:report.personal-learning.view"]}, "dept": {"status": 200, "ids": ["A", "C", "M"], "count": 3, "sources": ["role:t5-one-role-native:department-report:report.personal-learning.view"]}, "sameB": {"allStatus": 200, "allIds": ["B"], "deptStatus": 403, "deptRows": null}} | {"all": {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7, "sources": ["role:t5-one-role-native:personal-learning:report.personal-learning.view"]}, "dept": {"status": 200, "ids": ["A", "C", "M"], "count": 3, "sources": ["role:t5-one-role-native:department-report:report.personal-learning.view"]}, "sameB": {"allStatus": 200, "allIds": ["B"], "deptStatus": 403, "deptRows": null}} | 通过 |
| 383 | T01 one membership simultaneous two-node literal lists counts and same B direct ID B | {"all": {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7, "sources": ["role:t5-one-role-native:personal-learning:report.personal-learning.view"]}, "dept": {"status": 200, "ids": ["A", "C", "M"], "count": 3, "sources": ["role:t5-one-role-native:department-report:report.personal-learning.view"]}, "sameB": {"allStatus": 200, "allIds": ["B"], "deptStatus": 403, "deptRows": null}} | {"all": {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7, "sources": ["role:t5-one-role-native:personal-learning:report.personal-learning.view"]}, "dept": {"status": 200, "ids": ["A", "C", "M"], "count": 3, "sources": ["role:t5-one-role-native:department-report:report.personal-learning.view"]}, "sameB": {"allStatus": 200, "allIds": ["B"], "deptStatus": 403, "deptRows": null}} | 通过 |
| 384 | A M page 20 | {"status": 200, "rows": 20, "count": 49998, "queries": 14} | {"status": 200, "rows": 20, "count": 49998, "queries": 14} | 通过 |
| 385 | A M page 50 | {"status": 200, "rows": 50, "count": 49998, "queries": 14} | {"status": 200, "rows": 50, "count": 49998, "queries": 14} | 通过 |
| 386 | A M page 200 | {"status": 200, "rows": 200, "count": 49998, "queries": 14} | {"status": 200, "rows": 200, "count": 49998, "queries": 14} | 通过 |
| 387 | A M page-independent query count | [14, 14, 14] | [14, 14, 14] | 通过 |
| 388 | A person-00003 page 20 | {"status": 200, "rows": 20, "count": 22875, "queries": 14} | {"status": 200, "rows": 20, "count": 22875, "queries": 14} | 通过 |
| 389 | A person-00003 page 50 | {"status": 200, "rows": 50, "count": 22875, "queries": 14} | {"status": 200, "rows": 50, "count": 22875, "queries": 14} | 通过 |
| 390 | A person-00003 page 200 | {"status": 200, "rows": 200, "count": 22875, "queries": 14} | {"status": 200, "rows": 200, "count": 22875, "queries": 14} | 通过 |
| 391 | A person-00003 page-independent query count | [14, 14, 14] | [14, 14, 14] | 通过 |
| 392 | B M page 20 | {"status": 200, "rows": 20, "count": 49998, "queries": 14} | {"status": 200, "rows": 20, "count": 49998, "queries": 14} | 通过 |
| 393 | B M page 50 | {"status": 200, "rows": 50, "count": 49998, "queries": 14} | {"status": 200, "rows": 50, "count": 49998, "queries": 14} | 通过 |
| 394 | B M page 200 | {"status": 200, "rows": 200, "count": 49998, "queries": 14} | {"status": 200, "rows": 200, "count": 49998, "queries": 14} | 通过 |
| 395 | B M page-independent query count | [14, 14, 14] | [14, 14, 14] | 通过 |
| 396 | B person-00003 page 20 | {"status": 200, "rows": 20, "count": 22875, "queries": 14} | {"status": 200, "rows": 20, "count": 22875, "queries": 14} | 通过 |
| 397 | B person-00003 page 50 | {"status": 200, "rows": 50, "count": 22875, "queries": 14} | {"status": 200, "rows": 50, "count": 22875, "queries": 14} | 通过 |
| 398 | B person-00003 page 200 | {"status": 200, "rows": 200, "count": 22875, "queries": 14} | {"status": 200, "rows": 200, "count": 22875, "queries": 14} | 通过 |
| 399 | B person-00003 page-independent query count | [14, 14, 14] | [14, 14, 14] | 通过 |
| 400 | complex actor actual non-ALL resolved scope and relevant pair caps | {"resolvedCounts": [23062, 15000], "allFlags": [false, false], "pairCaps": [30750, 20000], "companyIds": ["A", "I"]} | {"resolvedCounts": [23062, 15000], "allFlags": [false, false], "pairCaps": [30750, 20000], "companyIds": ["A", "I"]} | 通过 |
| 401 | ordered batch delegation revoke wins and zero write | {"status": 403, "roles": 0, "members": 0} | {"status": 403, "roles": 0, "members": 0} | 通过 |
| 402 | batch delegation before later revoke commits both members | {"status": 200, "members": 2} | {"status": 200, "members": 2} | 通过 |
| 403 | download chunk waits behind revoke and denies | {"status": 403, "rows": null, "observedRevision": 1791020890810} | {"status": 403, "rows": null, "observedRevision": 1791020890810} | 通过 |
| 404 | old job ticket cannot bypass new request | 403 | 403 | 通过 |
| 405 | HTTP six scope all | {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7} | {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7} | 通过 |
| 406 | HTTP six scope all | {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7} | {"status": 200, "ids": ["A", "B", "C", "D", "E", "M", "N"], "count": 7} | 通过 |
| 407 | HTTP six scope ownDept | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | 通过 |
| 408 | HTTP six scope ownDept | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | 通过 |
| 409 | HTTP six scope ownDeptSubtree | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | 通过 |
| 410 | HTTP six scope ownDeptSubtree | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | 通过 |
| 411 | HTTP six scope departments | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | 通过 |
| 412 | HTTP six scope departments | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | 通过 |
| 413 | HTTP six scope managed | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | 通过 |
| 414 | HTTP six scope managed | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | {"status": 200, "ids": ["B", "E", "N"], "count": 3} | 通过 |
| 415 | HTTP six scope self | {"status": 200, "ids": [], "count": 0} | {"status": 200, "ids": [], "count": 0} | 通过 |
| 416 | HTTP six scope self | {"status": 200, "ids": [], "count": 0} | {"status": 200, "ids": [], "count": 0} | 通过 |
| 417 | HTTP six scope specified subtree | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | 通过 |
| 418 | HTTP six scope specified subtree | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | {"status": 200, "ids": ["A", "C", "D", "M"], "count": 4} | 通过 |
| 419 | HTTP six scope specified no subtree | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | 通过 |
| 420 | HTTP six scope specified no subtree | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | {"status": 200, "ids": ["A", "C", "M"], "count": 3} | 通过 |
| 421 | HTTP six scope empty departments | {"status": 200, "ids": [], "count": 0} | {"status": 200, "ids": [], "count": 0} | 通过 |
| 422 | HTTP six scope empty departments | {"status": 200, "ids": [], "count": 0} | {"status": 200, "ids": [], "count": 0} | 通过 |
| 423 | HTTP SELF real own object | ["L"] | ["L"] | 通过 |
| 424 | HTTP role-local override does not narrow second-role union | [["A", "phone-A"], ["B", null], ["C", "phone-C"], ["D", null], ["E", null], ["M", "phone-M"], ["N", null]] | [["A", "phone-A"], ["B", null], ["C", "phone-C"], ["D", null], ["E", null], ["M", "phone-M"], ["N", null]] | 通过 |
| 425 | HTTP same-action export cannot borrow view-all | ["A", "C", "M"] | ["A", "C", "M"] | 通过 |
| 426 | T04 empty override removes only source fields | [["A", null], ["B", null], ["C", null], ["D", null], ["E", null], ["M", null], ["N", null]] | [["A", null], ["B", null], ["C", null], ["D", null], ["E", null], ["M", null], ["N", null]] | 通过 |
| 427 | T04 empty override denies only export source | 403 | 403 | 通过 |
| 428 | T04 deleted override restores role inheritance | ["phone-A", "phone-B", "phone-C", "phone-D", "phone-E", "phone-M", "phone-N"] | ["phone-A", "phone-B", "phone-C", "phone-D", "phone-E", "phone-M", "phone-N"] | 通过 |
| 429 | HTTP shrink before pagination count | {"ids": ["C"], "count": 3} | {"ids": ["C"], "count": 3} | 通过 |
| 430 | raw field sentinel scan list | [] | [] | 通过 |
| 431 | raw field sentinel scan detail | [] | [] | 通过 |
| 432 | raw field sentinel scan search | [] | [] | 通过 |
| 433 | raw field sentinel scan denial | [] | [] | 通过 |
| 434 | raw field sentinel scan export | [] | [] | 通过 |
| 435 | raw field sentinel scan storedChunks | [] | [] | 通过 |
| 436 | raw Redis snapshot sentinel scan | [] | [] | 通过 |
| 437 | raw application stdout stderr scan | [] | [] | 通过 |
| 438 | signed media ticket create real HTTP | 200 | 200 | 通过 |
| 439 | signed media exact segment before revoke | 200 | 200 | 通过 |
| 440 | signed media wrong binding denies L /projects/P/media/8 | 403 | 403 | 通过 |
| 441 | signed media wrong binding denies L /projects/Q/media/7 | 403 | 403 | 通过 |
| 442 | signed media wrong binding denies Z /projects/P/media/7 | 403 | 403 | 通过 |
| 443 | signed media wrong binding denies L /projects/P/media/7 | 403 | 403 | 通过 |
| 444 | valid signature with expired or wrong-tenant binding denies {"expires":0} | 403 | 403 | 通过 |
| 445 | valid signature with expired or wrong-tenant binding denies {"tenantId":"T2"} | 403 | 403 | 通过 |
| 446 | old signed ticket after revoke next request no bytes | {"status": 403, "fragment": null} | {"status": 403, "fragment": null} | 通过 |
| 447 | valid customer A sees only old A enrollment snapshot | [{"person_id": "X", "company_id": "A", "display_name": "X"}] | [{"person_id": "X", "company_id": "A", "display_name": "X"}] | 通过 |
| 448 | current person node absent before independent role | 403 | 403 | 通过 |
| 449 | current B person requires independent current-person authorization | ["X"] | ["X"] | 通过 |
| 450 | current person projection changed while enrollment snapshot stayed A | {"company_id": "B", "display_name": "new-B-X"} | {"company_id": "B", "display_name": "new-B-X"} | 通过 |
| 451 | old enrollment keeps captured name | {"person_id": "X", "company_id": "A", "display_name": "X"} | {"person_id": "X", "company_id": "A", "display_name": "X"} | 通过 |
| 452 | enrollment search cannot reveal transferred current name | [] | [] | 通过 |
| 453 | new company cannot acquire old enrollment | ["Y"] | ["Y"] | 通过 |
| 454 | new company old progress denies | 403 | 403 | 通过 |
| 455 | new company old attachment denies | 403 | 403 | 通过 |
| 456 | export captured enrollment name | "X" | "X" | 通过 |
