CREATE SCHEMA IF NOT EXISTS authz;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS report;
CREATE SCHEMA IF NOT EXISTS training;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE TABLE authz.revision(tenant_id text PRIMARY KEY, revision bigint NOT NULL DEFAULT 1, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), schema_version int NOT NULL DEFAULT 1);
CREATE TABLE organization.company(tenant_id text REFERENCES authz.revision, id text, PRIMARY KEY(tenant_id,id));
CREATE TABLE organization.department(tenant_id text REFERENCES authz.revision,id text,parent_id text,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,parent_id) REFERENCES organization.department);
CREATE TABLE organization.person(tenant_id text REFERENCES authz.revision,id text,company_id text NOT NULL,department_id text,manager_id text,internal boolean NOT NULL DEFAULT false,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company,FOREIGN KEY(tenant_id,department_id) REFERENCES organization.department,FOREIGN KEY(tenant_id,manager_id) REFERENCES organization.person DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE authz.company_grant(tenant_id text,person_id text,company_id text,PRIMARY KEY(tenant_id,person_id,company_id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company);
CREATE TABLE authz.session(token_hash text PRIMARY KEY,tenant_id text,person_id text,FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE authz.role(tenant_id text REFERENCES authz.revision,id text,PRIMARY KEY(tenant_id,id));
CREATE TABLE authz.membership(tenant_id text,id text,person_id text,role_id text,data jsonb NOT NULL,source_id text,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,role_id) REFERENCES authz.role,FOREIGN KEY(tenant_id,source_id) REFERENCES authz.membership);
CREATE TABLE training.project(tenant_id text,id text,created_by text NOT NULL,title text NOT NULL,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,team_enabled boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES organization.person);
CREATE TABLE training.appointment(tenant_id text,id text,person_id text,project_id text,active boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,project_id) REFERENCES training.project);
CREATE TABLE training.roster(tenant_id text,project_id text,person_id text,company_id text,PRIMARY KEY(tenant_id,project_id,person_id),FOREIGN KEY(tenant_id,project_id) REFERENCES training.project,FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company);
CREATE TABLE report.person_projection(tenant_id text,id text,person_id text,company_id text,enabled boolean NOT NULL,deleted boolean NOT NULL,phone text,email text,id_card text,fixture boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,person_id));
CREATE TABLE report.learning_fact(tenant_id text,id text,person_id text,data_company_id text NOT NULL,historical_department_id text,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,fixture boolean NOT NULL DEFAULT false,points int NOT NULL DEFAULT 1,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES report.person_projection(tenant_id,person_id));
CREATE INDEX person_dept ON organization.person(tenant_id,department_id,id);
CREATE INDEX person_manager ON organization.person(tenant_id,manager_id,id);
CREATE INDEX fact_company_person ON report.learning_fact(tenant_id,data_company_id,person_id);
CREATE INDEX fact_fixture ON report.learning_fact(tenant_id,fixture,id);
CREATE INDEX projection_company ON report.person_projection(tenant_id,company_id,id);
CREATE TABLE report.export_job(tenant_id text,id text,person_id text,revision bigint NOT NULL,options jsonb NOT NULL,payload jsonb,state text NOT NULL DEFAULT 'created',PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE knowledge.category(tenant_id text REFERENCES authz.revision,id text,parent_id text,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,parent_id) REFERENCES knowledge.category);
CREATE TABLE authz.audit(id bigserial PRIMARY KEY,tenant_id text,revision bigint,event text,at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE OR REPLACE FUNCTION authz.bump() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t text; r bigint;
BEGIN
 t=COALESCE(NEW.tenant_id,OLD.tenant_id);
 UPDATE authz.revision SET revision=revision+1,changed_at=clock_timestamp() WHERE tenant_id=t RETURNING revision INTO r;
 INSERT INTO authz.audit(tenant_id,revision,event) VALUES(t,r,TG_TABLE_SCHEMA||'.'||TG_TABLE_NAME||':'||TG_OP);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE OR REPLACE FUNCTION organization.validate_tree() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad boolean; depth int; lim int;
BEGIN
 lim=CASE WHEN TG_TABLE_SCHEMA='knowledge' THEN 10 ELSE 20 END;
 IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
 EXECUTE format('WITH RECURSIVE ancestors AS (SELECT id,parent_id,ARRAY[id] path,false cycle FROM %I.%I WHERE tenant_id=$1 AND id=$2 UNION ALL SELECT d.id,d.parent_id,a.path||d.id,d.id=ANY(a.path) FROM %I.%I d JOIN ancestors a ON d.id=a.parent_id WHERE d.tenant_id=$1 AND NOT a.cycle) SELECT bool_or(cycle OR id=$3),max(cardinality(path))+1 FROM ancestors',TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO bad,depth USING NEW.tenant_id,NEW.parent_id,NEW.id;
 IF bad OR depth>lim OR depth IS NULL THEN RAISE EXCEPTION 'invalid hierarchy'; END IF;
 -- Moving populated subtrees is conservatively denied; avoids descendants exceeding the depth cap.
 IF TG_OP='UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE tenant_id=$1 AND parent_id=$2)',TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO bad USING NEW.tenant_id,NEW.id;
 IF bad THEN RAISE EXCEPTION 'populated subtree move requires validated command'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tree BEFORE INSERT OR UPDATE ON organization.department FOR EACH ROW EXECUTE FUNCTION organization.validate_tree();
CREATE TRIGGER tree BEFORE INSERT OR UPDATE ON knowledge.category FOR EACH ROW EXECUTE FUNCTION organization.validate_tree();
