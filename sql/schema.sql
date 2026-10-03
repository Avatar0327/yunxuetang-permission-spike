CREATE SCHEMA IF NOT EXISTS authz;
CREATE SCHEMA IF NOT EXISTS organization;
CREATE SCHEMA IF NOT EXISTS report;
CREATE SCHEMA IF NOT EXISTS training;
CREATE SCHEMA IF NOT EXISTS knowledge;
CREATE TABLE authz.revision(tenant_id text PRIMARY KEY, revision bigint NOT NULL DEFAULT 1, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(), schema_version int NOT NULL DEFAULT 1);
CREATE TABLE organization.company(tenant_id text REFERENCES authz.revision, id text, PRIMARY KEY(tenant_id,id));
CREATE TABLE organization.department(tenant_id text REFERENCES authz.revision,id text,parent_id text,company_id text NOT NULL,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company,FOREIGN KEY(tenant_id,company_id,parent_id) REFERENCES organization.department(tenant_id,company_id,id));
CREATE TABLE organization.person(tenant_id text REFERENCES authz.revision,id text,company_id text NOT NULL,department_id text,manager_id text,display_name text NOT NULL DEFAULT '',job_id text,internal boolean NOT NULL DEFAULT false,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,CHECK(manager_id IS NULL OR manager_id<>id),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company,FOREIGN KEY(tenant_id,company_id,department_id) REFERENCES organization.department(tenant_id,company_id,id),FOREIGN KEY(tenant_id,manager_id) REFERENCES organization.person DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE authz.company_grant(tenant_id text,person_id text,company_id text,PRIMARY KEY(tenant_id,person_id,company_id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company);
CREATE TABLE authz.session(token_hash text PRIMARY KEY,tenant_id text,person_id text,FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE authz.role(tenant_id text REFERENCES authz.revision,id text,PRIMARY KEY(tenant_id,id));
CREATE TABLE authz.membership(tenant_id text,id text,person_id text,role_id text,data jsonb NOT NULL,source_id text,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,role_id) REFERENCES authz.role,FOREIGN KEY(tenant_id,source_id) REFERENCES authz.membership);
CREATE TABLE training.project(tenant_id text,id text,created_by text NOT NULL,title text NOT NULL,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,team_enabled boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES organization.person);
CREATE TABLE training.appointment(tenant_id text,id text,person_id text NOT NULL,project_id text NOT NULL,active boolean NOT NULL DEFAULT true,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,person_id,project_id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,project_id) REFERENCES training.project);
CREATE TABLE training.roster(tenant_id text,project_id text,person_id text,company_id text,PRIMARY KEY(tenant_id,project_id,person_id),FOREIGN KEY(tenant_id,project_id) REFERENCES training.project,FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company);
CREATE TABLE report.person_projection(tenant_id text,id text,person_id text,company_id text,enabled boolean NOT NULL,deleted boolean NOT NULL,phone text,email text,id_card text,fixture boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,person_id));
CREATE TABLE report.learning_fact(tenant_id text,id text,person_id text,data_company_id text NOT NULL,historical_department_id text,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,fixture boolean NOT NULL DEFAULT false,points int NOT NULL DEFAULT 1,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES report.person_projection(tenant_id,person_id));
CREATE INDEX person_dept ON organization.person(tenant_id,department_id,id);
CREATE INDEX person_manager ON organization.person(tenant_id,manager_id,id);
CREATE INDEX fact_company_person ON report.learning_fact(tenant_id,data_company_id,person_id);
CREATE INDEX fact_fixture ON report.learning_fact(tenant_id,fixture,id);
CREATE INDEX projection_company ON report.person_projection(tenant_id,company_id,id);

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
DECLARE bad boolean; depth int; lim int; height int;
BEGIN
 lim=CASE WHEN TG_TABLE_SCHEMA='knowledge' THEN 10 ELSE 20 END;
 IF NEW.parent_id IS NULL THEN RETURN NEW; END IF;
 EXECUTE format('WITH RECURSIVE ancestors AS (SELECT id,parent_id,ARRAY[id] path,false cycle FROM %I.%I WHERE tenant_id=$1 AND id=$2 UNION ALL SELECT d.id,d.parent_id,a.path||d.id,d.id=ANY(a.path) FROM %I.%I d JOIN ancestors a ON d.id=a.parent_id WHERE d.tenant_id=$1 AND NOT a.cycle) SELECT bool_or(cycle OR id=$3),max(cardinality(path))+1 FROM ancestors',TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO bad,depth USING NEW.tenant_id,NEW.parent_id,NEW.id;
 IF bad OR depth>lim OR depth IS NULL THEN RAISE EXCEPTION 'invalid hierarchy'; END IF;
 -- Validate descendants too: moving a populated subtree may not exceed its own module depth limit.
 EXECUTE format('WITH RECURSIVE descendants AS (SELECT id,1 h FROM %I.%I WHERE tenant_id=$1 AND id=$2 UNION ALL SELECT d.id,a.h+1 FROM %I.%I d JOIN descendants a ON d.parent_id=a.id WHERE d.tenant_id=$1) SELECT coalesce(max(h),1) FROM descendants',TG_TABLE_SCHEMA,TG_TABLE_NAME,TG_TABLE_SCHEMA,TG_TABLE_NAME) INTO height USING NEW.tenant_id,NEW.id;
 IF depth+height-1>lim THEN RAISE EXCEPTION 'invalid hierarchy'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER tree BEFORE INSERT OR UPDATE ON organization.department FOR EACH ROW EXECUTE FUNCTION organization.validate_tree();
CREATE TRIGGER tree BEFORE INSERT OR UPDATE ON knowledge.category FOR EACH ROW EXECUTE FUNCTION organization.validate_tree();
-- Task3 persistence: role policy is canonical when present; membership-local data retains overrides/provenance.
ALTER TABLE authz.role ADD COLUMN level int CHECK(level IN(1,2,3)), ADD COLUMN policies jsonb;
ALTER TABLE authz.audit ADD COLUMN details jsonb;
ALTER TABLE knowledge.category ADD COLUMN creator_id text, ADD COLUMN inherit_parent boolean NOT NULL DEFAULT false, ADD COLUMN force_children boolean NOT NULL DEFAULT false, ADD COLUMN grants jsonb NOT NULL DEFAULT '[]', ADD COLUMN college_id text NOT NULL DEFAULT 'main', ADD FOREIGN KEY(tenant_id,creator_id) REFERENCES organization.person;
CREATE TABLE knowledge.course(tenant_id text,id text,category_id text NOT NULL,uploader_id text NOT NULL,created_by text NOT NULL,title text NOT NULL,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,published boolean NOT NULL DEFAULT false,accessible boolean NOT NULL DEFAULT true,custom_browse jsonb,payload text NOT NULL DEFAULT 'synthetic-course-bytes',PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,category_id) REFERENCES knowledge.category,FOREIGN KEY(tenant_id,uploader_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,created_by) REFERENCES organization.person);
CREATE TABLE knowledge.classroom_member(tenant_id text,classroom_id text,person_id text,PRIMARY KEY(tenant_id,classroom_id,person_id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE training.face_to_face(tenant_id text,id text,owner_id text NOT NULL,created_by text NOT NULL,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,owner_id) REFERENCES organization.person,FOREIGN KEY(tenant_id,created_by) REFERENCES organization.person);
CREATE OR REPLACE FUNCTION authz.freeze_dependents() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_SCHEMA='authz' AND TG_TABLE_NAME='membership' THEN
  WITH RECURSIVE d AS (SELECT id FROM authz.membership WHERE tenant_id=NEW.tenant_id AND source_id=NEW.id UNION SELECT m.id FROM authz.membership m JOIN d ON m.source_id=d.id WHERE m.tenant_id=NEW.tenant_id)
  UPDATE authz.membership SET data=jsonb_set(data,'{provenance}','"recheck_required"') WHERE tenant_id=NEW.tenant_id AND id IN(SELECT id FROM d) AND data->>'provenance'<>'recheck_required';
 ELSE
  UPDATE authz.membership SET data=jsonb_set(data,'{provenance}','"recheck_required"') WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id) AND source_id IS NOT NULL AND data->>'provenance'<>'recheck_required';
 END IF;
 PERFORM knowledge.freeze_source_configs(COALESCE(NEW.tenant_id,OLD.tenant_id));
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER freeze_dependencies AFTER UPDATE ON authz.membership FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER UPDATE OR DELETE ON authz.role FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER INSERT OR UPDATE OR DELETE ON organization.department FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER INSERT OR UPDATE OR DELETE ON organization.person FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER INSERT OR UPDATE OR DELETE ON authz.company_grant FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER INSERT OR DELETE ON knowledge.course FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_object_dependencies AFTER UPDATE OF enabled,deleted,published,accessible,uploader_id ON knowledge.course FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER INSERT OR UPDATE OR DELETE ON training.project FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();
CREATE TRIGGER freeze_dependencies AFTER INSERT OR UPDATE OR DELETE ON training.face_to_face FOR EACH ROW EXECUTE FUNCTION authz.freeze_dependents();

CREATE OR REPLACE FUNCTION authz.validate_dependency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bad boolean;
BEGIN
 IF NEW.source_id IS NOT NULL THEN
 WITH RECURSIVE a AS (SELECT id,source_id FROM authz.membership WHERE tenant_id=NEW.tenant_id AND id=NEW.source_id UNION SELECT m.id,m.source_id FROM authz.membership m JOIN a ON m.id=a.source_id WHERE m.tenant_id=NEW.tenant_id)
 SELECT EXISTS(SELECT 1 FROM a WHERE id=NEW.id) INTO bad;
 IF bad OR NEW.source_id=NEW.id THEN RAISE EXCEPTION 'dependency cycle'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dependency_cycle BEFORE INSERT OR UPDATE OF source_id ON authz.membership FOR EACH ROW EXECUTE FUNCTION authz.validate_dependency();

ALTER TABLE knowledge.category ADD COLUMN source_id text, ADD COLUMN provenance text NOT NULL DEFAULT 'system_origin', ADD FOREIGN KEY(tenant_id,source_id) REFERENCES authz.membership;
ALTER TABLE knowledge.course ADD COLUMN custom_source_id text, ADD COLUMN custom_provenance text NOT NULL DEFAULT 'system_origin', ADD FOREIGN KEY(tenant_id,custom_source_id) REFERENCES authz.membership;

ALTER TABLE knowledge.category ADD COLUMN authority_snapshot jsonb;
ALTER TABLE knowledge.course ADD COLUMN custom_snapshot jsonb;

-- Owning-module transaction port; called by the central dependency trigger in the same transaction.
CREATE OR REPLACE FUNCTION knowledge.freeze_source_configs(tenant text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 UPDATE knowledge.category SET provenance='recheck_required' WHERE tenant_id=tenant AND source_id IS NOT NULL AND provenance<>'recheck_required';
 UPDATE knowledge.course SET custom_provenance='recheck_required' WHERE tenant_id=tenant AND custom_source_id IS NOT NULL AND custom_provenance<>'recheck_required';
END $$;

CREATE TABLE knowledge.policy_audit(id bigserial PRIMARY KEY,tenant_id text REFERENCES authz.revision,target_id text,kind text NOT NULL CHECK(kind IN('category','custom')),state text NOT NULL CHECK(state IN('active','suspended')),source_id text NOT NULL,revision bigint NOT NULL,snapshot jsonb,at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,source_id) REFERENCES authz.membership);

ALTER TABLE report.person_projection ADD COLUMN department_id text, ADD COLUMN manager_id text, ADD COLUMN job_id text, ADD COLUMN display_name text NOT NULL DEFAULT '';
ALTER TABLE report.learning_fact ADD COLUMN historical_job_id text, ADD COLUMN historical_status text NOT NULL DEFAULT 'enabled' CHECK(historical_status IN('enabled','disabled','deleted'));
-- Native candidate 1: cover the unchanged historical aggregate and its fact predicates.
-- Retain fact_company_person to measure this additive physical candidate in isolation.
CREATE INDEX fact_company_person_cover ON report.learning_fact(tenant_id,data_company_id,person_id)
 INCLUDE (enabled,deleted,historical_department_id,historical_job_id,historical_status,points);
CREATE OR REPLACE FUNCTION report.immutable_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.person_id,NEW.data_company_id,NEW.historical_department_id,NEW.historical_job_id,NEW.historical_status) IS DISTINCT FROM (OLD.person_id,OLD.data_company_id,OLD.historical_department_id,OLD.historical_job_id,OLD.historical_status) THEN RAISE EXCEPTION 'immutable history'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_history BEFORE UPDATE ON report.learning_fact FOR EACH ROW EXECUTE FUNCTION report.immutable_history();

CREATE TABLE training.person_projection(tenant_id text,id text,person_id text,company_id text NOT NULL,enabled boolean NOT NULL,deleted boolean NOT NULL,department_id text,manager_id text,display_name text NOT NULL,PRIMARY KEY(tenant_id,id));

ALTER TABLE training.roster ADD COLUMN progress int NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100), ADD COLUMN attachment text NOT NULL DEFAULT 'synthetic-person-attachment';

CREATE SCHEMA account;
CREATE TABLE account.person_projection(tenant_id text,person_id text,enabled boolean NOT NULL,deleted boolean NOT NULL,PRIMARY KEY(tenant_id,person_id));
CREATE TABLE account.source(tenant_id text,company_id text,id text,payload text NOT NULL,PRIMARY KEY(tenant_id,company_id,id),FOREIGN KEY(tenant_id,company_id) REFERENCES organization.company);
CREATE TABLE account.entry(tenant_id text,id text,person_id text NOT NULL,data_company_id text NOT NULL,currency text NOT NULL CHECK(currency IN('credit','point')),kind text NOT NULL CHECK(kind IN('debt','reward')),amount int NOT NULL CHECK(amount>=0),remaining int NOT NULL CHECK(remaining>=0 AND remaining<=amount),source_id text NOT NULL,enabled boolean NOT NULL DEFAULT true,deleted boolean NOT NULL DEFAULT false,cross_company_reference boolean NOT NULL DEFAULT false CHECK(NOT cross_company_reference),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES account.person_projection,FOREIGN KEY(tenant_id,data_company_id,source_id) REFERENCES account.source);
CREATE TABLE account.offset_audit(id bigserial PRIMARY KEY,tenant_id text,debt_id text,reward_id text,amount int NOT NULL CHECK(amount>=0),actor_id text NOT NULL,at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(tenant_id,debt_id) REFERENCES account.entry,FOREIGN KEY(tenant_id,reward_id) REFERENCES account.entry);

-- Task5: protected bounded export persistence, owned per domain.
CREATE TABLE authz.export_worker(token_hash text PRIMARY KEY,tenant_id text REFERENCES authz.revision,domain text NOT NULL CHECK(domain IN('report','training','account')),enabled boolean NOT NULL DEFAULT true);
CREATE TABLE report.export_epoch(tenant_id text PRIMARY KEY REFERENCES authz.revision,version bigint NOT NULL DEFAULT 1);
CREATE TABLE report.export_job(tenant_id text,id text,person_id text,revision bigint NOT NULL,epoch bigint NOT NULL,options jsonb NOT NULL,total_count int NOT NULL,next_offset int NOT NULL DEFAULT 0,chunk_count int NOT NULL DEFAULT 0,state text NOT NULL DEFAULT 'created' CHECK(state IN('created','running','ready')),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE report.export_chunk(tenant_id text,job_id text,chunk_no int NOT NULL CHECK(chunk_no>=0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='array' AND jsonb_array_length(payload)<=200),PRIMARY KEY(tenant_id,job_id,chunk_no),FOREIGN KEY(tenant_id,job_id) REFERENCES report.export_job ON DELETE CASCADE);
CREATE OR REPLACE FUNCTION report.bump_export_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE report.export_epoch SET version=version+1 WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TABLE training.export_epoch(tenant_id text PRIMARY KEY REFERENCES authz.revision,version bigint NOT NULL DEFAULT 1);
CREATE TABLE training.export_job(tenant_id text,id text,person_id text,revision bigint NOT NULL,epoch bigint NOT NULL,options jsonb NOT NULL,total_count int NOT NULL,next_offset int NOT NULL DEFAULT 0,chunk_count int NOT NULL DEFAULT 0,state text NOT NULL DEFAULT 'created' CHECK(state IN('created','running','ready')),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE training.export_chunk(tenant_id text,job_id text,chunk_no int NOT NULL CHECK(chunk_no>=0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='array' AND jsonb_array_length(payload)<=200),PRIMARY KEY(tenant_id,job_id,chunk_no),FOREIGN KEY(tenant_id,job_id) REFERENCES training.export_job ON DELETE CASCADE);
CREATE OR REPLACE FUNCTION training.bump_export_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE training.export_epoch SET version=version+1 WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TABLE account.export_epoch(tenant_id text PRIMARY KEY REFERENCES authz.revision,version bigint NOT NULL DEFAULT 1);
CREATE TABLE account.export_job(tenant_id text,id text,person_id text,revision bigint NOT NULL,epoch bigint NOT NULL,options jsonb NOT NULL,total_count int NOT NULL,next_offset int NOT NULL DEFAULT 0,chunk_count int NOT NULL DEFAULT 0,state text NOT NULL DEFAULT 'created' CHECK(state IN('created','running','ready')),PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,person_id) REFERENCES organization.person);
CREATE TABLE account.export_chunk(tenant_id text,job_id text,chunk_no int NOT NULL CHECK(chunk_no>=0),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='array' AND jsonb_array_length(payload)<=200),PRIMARY KEY(tenant_id,job_id,chunk_no),FOREIGN KEY(tenant_id,job_id) REFERENCES account.export_job ON DELETE CASCADE);
CREATE OR REPLACE FUNCTION account.bump_export_epoch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE account.export_epoch SET version=version+1 WHERE tenant_id=COALESCE(NEW.tenant_id,OLD.tenant_id);
 RETURN COALESCE(NEW,OLD);
END $$;

-- Captured enrollment name stands in for the full approved immutable person_snapshot.
ALTER TABLE training.roster ADD COLUMN snapshot_display_name text NOT NULL DEFAULT '';
CREATE OR REPLACE FUNCTION training.enrollment_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT display_name INTO NEW.snapshot_display_name FROM training.person_projection WHERE tenant_id=NEW.tenant_id AND person_id=NEW.person_id;
  IF NEW.snapshot_display_name IS NULL THEN RAISE EXCEPTION 'missing enrollment snapshot'; END IF;
 ELSIF NEW.company_id IS DISTINCT FROM OLD.company_id OR NEW.person_id IS DISTINCT FROM OLD.person_id OR NEW.snapshot_display_name IS DISTINCT FROM OLD.snapshot_display_name THEN
  RAISE EXCEPTION 'immutable enrollment snapshot';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER snapshot BEFORE INSERT OR UPDATE ON training.roster FOR EACH ROW EXECUTE FUNCTION training.enrollment_snapshot();

-- Round 2: T-1 historical aggregate projection (DIFF-05). Facts are frozen per batch;
-- authorization, current person state, company caps and source pairs stay live per request.
-- Units are (person, data company, fixture). Level 0 cells are one data company; level 1
-- cells are the person's department at refresh time. A cell is summed from its pre-aggregate
-- only when every unit in it is currently authorized; other units read person aggregates.
CREATE SEQUENCE report.history_agg_batch_seq;
CREATE TABLE report.history_agg_batch(tenant_id text NOT NULL,batch_id bigint NOT NULL,as_of timestamptz NOT NULL,PRIMARY KEY(tenant_id,batch_id));
CREATE TABLE report.history_agg_current(tenant_id text PRIMARY KEY,batch_id bigint NOT NULL,FOREIGN KEY(tenant_id,batch_id) REFERENCES report.history_agg_batch);
CREATE TABLE report.history_agg_unit(tenant_id text NOT NULL,batch_id bigint NOT NULL,person_id text NOT NULL,data_company_id text NOT NULL,fixture boolean NOT NULL,cell text NOT NULL,PRIMARY KEY(tenant_id,batch_id,person_id,data_company_id,fixture));
CREATE TABLE report.history_agg_size(tenant_id text NOT NULL,batch_id bigint NOT NULL,level smallint NOT NULL CHECK(level IN(0,1)),cell text NOT NULL,data_company_id text NOT NULL,fixture boolean NOT NULL,units int NOT NULL CHECK(units>0),PRIMARY KEY(tenant_id,batch_id,level,cell,data_company_id,fixture));
CREATE TABLE report.history_agg_cell(tenant_id text NOT NULL,batch_id bigint NOT NULL,level smallint NOT NULL CHECK(level IN(0,1)),cell text NOT NULL,data_company_id text NOT NULL,fixture boolean NOT NULL,historical_department_id text,historical_job_id text,historical_status text NOT NULL,count int NOT NULL,points bigint NOT NULL);
CREATE INDEX history_agg_cell_key ON report.history_agg_cell(tenant_id,batch_id,level,cell,data_company_id,fixture);
CREATE TABLE report.history_agg_person(tenant_id text NOT NULL,batch_id bigint NOT NULL,person_id text NOT NULL,data_company_id text NOT NULL,fixture boolean NOT NULL,historical_department_id text,historical_job_id text,historical_status text NOT NULL,count int NOT NULL,points bigint NOT NULL);
CREATE INDEX history_agg_person_key ON report.history_agg_person(tenant_id,batch_id,person_id,data_company_id,fixture);
