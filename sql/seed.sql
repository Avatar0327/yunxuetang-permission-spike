INSERT INTO authz.revision(tenant_id) VALUES('T1'),('T2');
INSERT INTO organization.company SELECT t,c FROM unnest(ARRAY['T1','T2'])t CROSS JOIN unnest(ARRAY['I','A','B'])c;
INSERT INTO organization.department VALUES('T1','D1',null,'I'),('T1','D2',null,'I'),('T1','D11','D1','I');
INSERT INTO organization.department SELECT 'T1','chain-'||i,CASE WHEN i=1 THEN null ELSE 'chain-'||(i-1) END,'I' FROM generate_series(1,20)i;
INSERT INTO organization.department SELECT 'T1','wide-'||i,CASE WHEN i IN(1,2) THEN null WHEN i%3=0 THEN 'D2' WHEN i%3=1 THEN 'wide-1' ELSE 'wide-2' END,(ARRAY['I','A','B'])[1+i%3] FROM generate_series(1,1977)i;
INSERT INTO organization.department VALUES('T2','other',null,'I');
INSERT INTO organization.person(tenant_id,id,company_id,department_id,manager_id,internal,enabled,deleted) VALUES
('T1','M','I','D1',null,true,true,false),('T1','A','I','D1','M',true,true,false),('T1','B','I','D2','M',true,true,false),('T1','C','I','D1','N',true,true,false),('T1','D','I','D11','N',true,true,false),('T1','E','I','D2','A',true,true,false),('T1','N','I','D2',null,true,true,false),
('T1','X','A',null,null,false,true,false),('T1','Y','B',null,null,false,true,false),('T1','L','I',null,null,true,true,false),('T1','Z','I',null,null,true,true,false),('T1','disabled','I',null,null,true,false,false),('T1','deleted','I',null,null,true,true,true);
INSERT INTO organization.person(tenant_id,id,company_id,department_id) SELECT 'T1','person-'||lpad(i::text,5,'0'),(ARRAY['I','A','B'])[1+i%3],'wide-'||(1+(i-1)%1977) FROM generate_series(1,49987)i;
INSERT INTO organization.person(tenant_id,id,company_id,department_id) SELECT 'T2','other-'||i,'I','other' FROM generate_series(1,500)i;
INSERT INTO authz.company_grant VALUES('T1','M','I'),('T1','M','A'),('T1','M','B'),('T1','Z','I'),('T1','Z','A'),('T1','Z','B'),('T1','L','I');
INSERT INTO authz.role(tenant_id,id) SELECT 'T1','role-'||i FROM generate_series(1,20)i;
INSERT INTO report.person_projection(tenant_id,id,person_id,company_id,enabled,deleted,phone,email,id_card,fixture) SELECT tenant_id,id,id,company_id,enabled,deleted,'phone-'||id,'email-'||id,'card-'||id,id IN ('A','B','C','D','E','M','N') FROM organization.person;
INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,enabled,deleted,fixture,points,historical_job_id,historical_status) SELECT 'T1','fact-'||lpad(i::text,7,'0'),'person-'||lpad((1+(i-1)%49987)::text,5,'0'),(ARRAY['I','A','B'])[1+(1+(i-1)%49987)%3],'old-dept-'||(i%20),true,false,false,1,'old-job-'||(i%5),CASE WHEN i%7=0 THEN 'disabled' ELSE 'enabled' END FROM generate_series(1,1000000)i;
INSERT INTO report.learning_fact(tenant_id,id,person_id,data_company_id,historical_department_id,enabled,deleted,fixture,points) VALUES('T1','h-X-A','X','A','old-A',true,false,true,10),('T1','h-X-B','X','B','old-B',true,false,true,20);
INSERT INTO training.project(tenant_id,id,created_by,title) VALUES('T1','P','Z','共享项目 P'),('T1','Q','Z','项目 Q');
INSERT INTO knowledge.category(tenant_id,id,parent_id) SELECT 'T1','cat-'||i,CASE WHEN i=1 THEN null ELSE 'cat-'||(i-1) END FROM generate_series(1,10)i;

UPDATE organization.person SET internal=(company_id='I'),display_name=CASE WHEN tenant_id='T2' THEN 'person-'||lpad(substring(id from 7)::text,5,'0') ELSE id END,job_id='job-'||CASE WHEN company_id='I' THEN 'internal' ELSE 'customer' END;
UPDATE report.person_projection r SET department_id=p.department_id,manager_id=p.manager_id,job_id=p.job_id,display_name=p.display_name FROM organization.person p WHERE p.tenant_id=r.tenant_id AND p.id=r.person_id;

INSERT INTO training.person_projection SELECT tenant_id,id,id,company_id,enabled,deleted,department_id,manager_id,display_name FROM organization.person;



INSERT INTO account.person_projection SELECT tenant_id,id,enabled,deleted FROM organization.person;
INSERT INTO account.source VALUES('T1','A','source-X-A','A-private-source'),('T1','B','source-X-B','B-private-source');
INSERT INTO account.entry(tenant_id,id,person_id,data_company_id,currency,kind,amount,remaining,source_id) VALUES
('T1','debt-X-A','X','A','credit','debt',30,30,'source-X-A'),
('T1','debt-X-B','X','B','credit','debt',10,10,'source-X-B'),
('T1','reward-X-B','X','B','credit','reward',20,20,'source-X-B'),
('T1','reward-X-B-point','X','B','point','reward',8,8,'source-X-B');
INSERT INTO training.roster(tenant_id,project_id,person_id,company_id) VALUES('T1','P','X','A'),('T1','P','Y','B'),('T1','P','A','I');

UPDATE training.roster SET progress=CASE person_id WHEN 'X' THEN 25 WHEN 'Y' THEN 75 ELSE 50 END,attachment='attachment-'||person_id;
