const { Client } = require('pg');

const STATEMENTS = [
  'CREATE SCHEMA IF NOT EXISTS pms_app',
  `CREATE OR REPLACE FUNCTION pms_app.app_uuid(kind text, source_key text)
   RETURNS uuid LANGUAGE sql IMMUTABLE AS $fn$
     SELECT (
       substr(md5('careyu:' || kind || ':' || source_key), 1, 8) || '-' ||
       substr(md5('careyu:' || kind || ':' || source_key), 9, 4) || '-' ||
       '4' || substr(md5('careyu:' || kind || ':' || source_key), 14, 3) || '-' ||
       'a' || substr(md5('careyu:' || kind || ':' || source_key), 18, 3) || '-' ||
       substr(md5('careyu:' || kind || ':' || source_key), 21, 12)
     )::uuid
   $fn$`,
  `CREATE OR REPLACE FUNCTION pms_app.as_date(value text)
   RETURNS date LANGUAGE plpgsql IMMUTABLE AS $fn$
   BEGIN
     IF value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN RETURN NULL; END IF;
     RETURN left(value, 10)::date;
   EXCEPTION WHEN others THEN RETURN NULL;
   END
   $fn$`,
  `CREATE TABLE IF NOT EXISTS pms_app.user_auth_state (
     user_id UUID PRIMARY KEY,
     last_login_at TIMESTAMPTZ,
     failed_login_count INTEGER NOT NULL DEFAULT 0,
     locked_until TIMESTAMPTZ,
     must_change_password BOOLEAN NOT NULL DEFAULT FALSE
   )`,
  `CREATE OR REPLACE VIEW pms_app.roles AS
   SELECT id::smallint, code::varchar(50), name::varchar(100), ''::text AS description, NOW() AS created_at, NOW() AS updated_at
   FROM (VALUES
     (1, 'admin', 'CEO'),
     (2, 'super_admin', 'System Admin'),
     (3, 'management', 'Management'),
     (4, 'project_manager', 'Project Manager'),
     (5, 'team_lead', 'Team Lead'),
     (6, 'employee', 'Employee')
   ) AS role(id, code, name)`,
  `CREATE OR REPLACE VIEW pms_app.users AS
   SELECT
     pms_app.app_uuid('user', u.user_key) AS id,
     u.name AS full_name,
     lower(u.email) AS email,
     CASE u.role_code
       WHEN 'CEO' THEN 'Executive'
       WHEN 'CTO' THEN 'Engineering'
       WHEN 'BUSINESS_HEAD' THEN 'Business'
       WHEN 'ENG_DIRECTOR' THEN 'Engineering'
       WHEN 'PROJECT_MANAGER' THEN 'Projects'
       ELSE COALESCE(u.team_name, '')
     END AS department,
     CASE u.role_code
       WHEN 'CEO' THEN 'CEO'
       WHEN 'CTO' THEN 'CTO'
       WHEN 'BUSINESS_HEAD' THEN 'Business Head'
       WHEN 'ENG_DIRECTOR' THEN 'Engineering Director'
       WHEN 'PROJECT_MANAGER' THEN 'Project Manager'
       WHEN 'TEAM_LEAD' THEN 'Team Lead'
       WHEN 'SYSTEM_ADMIN' THEN 'System Admin'
       ELSE initcap(replace(lower(COALESCE(u.role_code, 'employee')), '_', ' '))
     END AS designation,
     (CASE u.role_code
       WHEN 'CEO' THEN 1 WHEN 'SYSTEM_ADMIN' THEN 2
       WHEN 'CTO' THEN 3 WHEN 'BUSINESS_HEAD' THEN 3 WHEN 'ENG_DIRECTOR' THEN 3
       WHEN 'PROJECT_MANAGER' THEN 4 WHEN 'TEAM_LEAD' THEN 5 ELSE 6
     END)::smallint AS role_id,
     (upper(COALESCE(u.account_status, '')) = 'ACTIVE' AND upper(COALESCE(u.status, '')) = 'ACTIVE') AS is_active,
     CASE WHEN upper(COALESCE(u.account_status, '')) = 'ACTIVE' AND upper(COALESCE(u.status, '')) = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END AS account_status,
     u.created_at,
     COALESCE(u.updated_at, u.created_at) AS updated_at,
     s.last_login_at,
     COALESCE(s.must_change_password, FALSE) AS must_change_password,
     u.password_created_at AS credentials_initialized_at,
     u.password_hash,
     COALESCE(s.failed_login_count, 0) AS failed_login_count,
     s.locked_until,
     COALESCE(u.phone, '') AS phone,
     COALESCE(u.employee_id, '') AS employee_code,
     CASE WHEN u.role_code IN ('CEO', 'SYSTEM_ADMIN', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER') THEN 'ORGANIZATION' ELSE 'TEAM_ONLY' END AS access_scope,
     CASE WHEN mgr.user_key IS NOT NULL THEN pms_app.app_uuid('user', u.reporting_manager_id) ELSE NULL END AS reporting_manager_id,
     NULL::uuid AS co_manager_id,
     40::numeric(4, 1) AS weekly_capacity_hours,
     ''::varchar(120) AS work_location,
     CASE WHEN upper(COALESCE(u.status, '')) = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END AS employment_status,
     NULL::date AS joining_date
   FROM public.users u
   LEFT JOIN pms_app.user_auth_state s ON s.user_id = pms_app.app_uuid('user', u.user_key)
   LEFT JOIN public.users mgr ON mgr.user_key = u.reporting_manager_id`,
  `CREATE OR REPLACE FUNCTION pms_app.apply_user_update()
   RETURNS trigger LANGUAGE plpgsql AS $fn$
   BEGIN
     IF NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
       UPDATE public.users SET password_hash = NEW.password_hash, password_changed_at = NOW()
       WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
       UPDATE public.users SET name = NEW.full_name WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     IF NEW.phone IS DISTINCT FROM OLD.phone THEN
       UPDATE public.users SET phone = COALESCE(NEW.phone, '') WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     IF NEW.email IS DISTINCT FROM OLD.email THEN
       UPDATE public.users SET email = lower(COALESCE(NEW.email, '')) WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     IF NEW.employee_code IS DISTINCT FROM OLD.employee_code THEN
       UPDATE public.users SET employee_id = COALESCE(NEW.employee_code, '') WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
       UPDATE public.users
       SET role_code = CASE NEW.role_id
             WHEN 1 THEN 'CEO' WHEN 2 THEN 'SYSTEM_ADMIN' WHEN 4 THEN 'PROJECT_MANAGER'
             WHEN 5 THEN 'TEAM_LEAD' WHEN 6 THEN 'EMPLOYEE'
             ELSE role_code
           END,
           role = CASE NEW.role_id
             WHEN 1 THEN 'CEO' WHEN 2 THEN 'SYSTEM_ADMIN' WHEN 4 THEN 'PROJECT_MANAGER'
             WHEN 5 THEN 'TEAM_LEAD' WHEN 6 THEN 'EMPLOYEE'
             ELSE role
           END
       WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     IF NEW.reporting_manager_id IS DISTINCT FROM OLD.reporting_manager_id THEN
       UPDATE public.users u
       SET reporting_manager_id = mgr.user_key,
           reporting_manager_name = COALESCE(mgr.name, '')
       FROM (SELECT user_key, name FROM public.users WHERE pms_app.app_uuid('user', user_key) = NEW.reporting_manager_id LIMIT 1) mgr
       WHERE pms_app.app_uuid('user', u.user_key) = OLD.id AND NEW.reporting_manager_id IS NOT NULL;
       IF NEW.reporting_manager_id IS NULL THEN
         UPDATE public.users SET reporting_manager_id = '', reporting_manager_name = ''
         WHERE pms_app.app_uuid('user', user_key) = OLD.id;
       END IF;
     END IF;
     IF NEW.account_status IS DISTINCT FROM OLD.account_status OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
       UPDATE public.users
       SET account_status = CASE WHEN NEW.is_active AND NEW.account_status = 'ACTIVE' THEN 'ACTIVE' ELSE 'DISABLED' END,
           status = CASE WHEN NEW.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END
       WHERE pms_app.app_uuid('user', user_key) = OLD.id;
     END IF;
     INSERT INTO pms_app.user_auth_state (user_id, last_login_at, failed_login_count, locked_until, must_change_password)
     VALUES (OLD.id, NEW.last_login_at, COALESCE(NEW.failed_login_count, 0), NEW.locked_until, COALESCE(NEW.must_change_password, FALSE))
     ON CONFLICT (user_id) DO UPDATE SET
       last_login_at = EXCLUDED.last_login_at,
       failed_login_count = EXCLUDED.failed_login_count,
       locked_until = EXCLUDED.locked_until,
       must_change_password = EXCLUDED.must_change_password;
     RETURN NEW;
   END
   $fn$`,
  'DROP TRIGGER IF EXISTS users_apply_update ON pms_app.users',
  `CREATE TRIGGER users_apply_update INSTEAD OF UPDATE ON pms_app.users
   FOR EACH ROW EXECUTE FUNCTION pms_app.apply_user_update()`,
  `CREATE TABLE IF NOT EXISTS pms_app.team_profile (
     team_id UUID PRIMARY KEY,
     department VARCHAR(100) NOT NULL DEFAULT '',
     assignment_rule VARCHAR(30) NOT NULL DEFAULT 'TEAM_LEAD_ONLY',
     category VARCHAR(100) NOT NULL DEFAULT ''
   )`,
  `CREATE OR REPLACE VIEW pms_app.teams AS
   SELECT
     pms_app.app_uuid('team', t.record_key) AS id,
     t.code,
     t.name,
     COALESCE(profile.department, '')::varchar(100) AS department,
     COALESCE(t.description, '') AS description,
     CASE WHEN upper(COALESCE(t.status, '')) = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
     CASE WHEN lead.user_key IS NOT NULL THEN pms_app.app_uuid('user', t.team_lead_id) ELSE NULL END AS lead_id,
     NULL::uuid AS created_by,
     t.created_at,
     t.created_at AS updated_at,
     COALESCE(profile.assignment_rule, 'TEAM_LEAD_ONLY')::varchar(30) AS assignment_rule,
     COALESCE(profile.category, '')::varchar(100) AS category
   FROM public.teams t
   LEFT JOIN public.users lead ON lead.user_key = t.team_lead_id
   LEFT JOIN pms_app.team_profile profile ON profile.team_id = pms_app.app_uuid('team', t.record_key)`,
  `CREATE OR REPLACE VIEW pms_app.team_members AS
   SELECT
     pms_app.app_uuid('member', u.user_key || ':' || t.record_key) AS id,
     pms_app.app_uuid('team', t.record_key) AS team_id,
     pms_app.app_uuid('user', u.user_key) AS user_id,
     CASE WHEN u.user_key = t.team_lead_id OR u.role_code = 'TEAM_LEAD' THEN 'TEAM_LEAD' ELSE 'MEMBER' END AS role,
     CASE WHEN upper(COALESCE(u.account_status, '')) = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
     COALESCE(u.created_at::date, CURRENT_DATE) AS joined_at,
     u.created_at,
     COALESCE(u.updated_at, u.created_at) AS updated_at,
     TRUE AS is_primary
   FROM public.users u
   JOIN public.teams t ON t.record_key = u.team_id
   WHERE COALESCE(u.team_id, '') <> ''`,
  `CREATE SEQUENCE IF NOT EXISTS pms_app.project_code_seq START 1`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_registry (
     id UUID PRIMARY KEY,
     project_code VARCHAR(20) NOT NULL,
     title VARCHAR(200) NOT NULL,
     customer_name VARCHAR(200) NOT NULL DEFAULT '',
     lead_id UUID,
     feasibility_id UUID,
     costing_id UUID,
     costing_version_id UUID,
     status VARCHAR(40) NOT NULL DEFAULT 'READY_FOR_EXECUTION',
     priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     project_manager_id UUID,
     start_date DATE,
     target_date DATE,
     completion_date DATE,
     description TEXT NOT NULL DEFAULT '',
     site_location TEXT NOT NULL DEFAULT '',
     customer_contact TEXT NOT NULL DEFAULT '',
     hold_reason TEXT NOT NULL DEFAULT '',
     risk_reason TEXT NOT NULL DEFAULT '',
     completion_remarks TEXT NOT NULL DEFAULT '',
     approved_value NUMERIC,
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     project_type VARCHAR(40) NOT NULL DEFAULT '',
     department VARCHAR(100) NOT NULL DEFAULT '',
     team_code VARCHAR(40) NOT NULL DEFAULT '',
     assignment_type VARCHAR(30) NOT NULL DEFAULT '',
     assigned_to_id UUID,
     assigned_team_id UUID,
     team_review_status VARCHAR(40) NOT NULL DEFAULT '',
     team_reviewed_by UUID,
     handover_notes TEXT NOT NULL DEFAULT '',
     handover_at TIMESTAMPTZ
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_registry_lead_idx ON pms_app.project_registry (lead_id) WHERE lead_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_registry_costing_idx ON pms_app.project_registry (costing_id) WHERE costing_id IS NOT NULL`,
  `CREATE OR REPLACE VIEW pms_app.projects AS
   SELECT
     r.id,
     r.project_code,
     r.title,
     r.customer_name,
     r.lead_id,
     r.feasibility_id,
     r.costing_id,
     r.costing_version_id,
     r.status,
     r.priority,
     r.project_manager_id,
     r.start_date,
     r.target_date,
     r.completion_date,
     r.description,
     r.site_location,
     r.customer_contact,
     r.hold_reason,
     r.risk_reason,
     r.completion_remarks,
     r.approved_value,
     r.created_by,
     r.created_at,
     r.updated_at,
     r.project_type,
     r.department,
     r.team_code,
     r.assignment_type,
     r.assigned_to_id,
     r.assigned_team_id,
     r.team_review_status,
     r.team_reviewed_by,
     r.handover_notes,
     r.handover_at
   FROM pms_app.project_registry r
   UNION ALL
   SELECT
     pms_app.app_uuid('project', src.label) AS id,
     ('PRJ-' || lpad(row_number() OVER (ORDER BY src.title)::text, 3, '0'))::varchar(20) AS project_code,
     src.title::varchar(200) AS title,
     src.customer_name::varchar(200) AS customer_name,
     NULL::uuid AS lead_id,
     NULL::uuid AS feasibility_id,
     NULL::uuid AS costing_id,
     NULL::uuid AS costing_version_id,
     'IN_PROGRESS'::varchar(40) AS status,
     'MEDIUM'::varchar(20) AS priority,
     NULL::uuid AS project_manager_id,
     NULL::date AS start_date,
     NULL::date AS target_date,
     NULL::date AS completion_date,
     ''::text AS description,
     ''::text AS site_location,
     ''::text AS customer_contact,
     ''::text AS hold_reason,
     ''::text AS risk_reason,
     ''::text AS completion_remarks,
     NULL::numeric AS approved_value,
     NULL::uuid AS created_by,
     NOW() AS created_at,
     NOW() AS updated_at,
     ''::varchar(40) AS project_type,
     ''::varchar(100) AS department,
     ''::varchar(40) AS team_code,
     ''::varchar(30) AS assignment_type,
     NULL::uuid AS assigned_to_id,
     NULL::uuid AS assigned_team_id,
     ''::varchar(40) AS team_review_status,
     NULL::uuid AS team_reviewed_by,
     ''::text AS handover_notes,
     NULL::timestamptz AS handover_at
   FROM (
     SELECT
       CASE WHEN btrim(COALESCE(project_name, '')) = '' THEN 'internal work' ELSE lower(btrim(project_name)) END AS label,
       CASE WHEN btrim(COALESCE(project_name, '')) = '' THEN 'Internal work' ELSE btrim(project_name) END AS title,
       COALESCE(MAX(NULLIF(btrim(customer_name), '')), '') AS customer_name
     FROM public.tasks
     GROUP BY 1, 2
   ) src
   WHERE NOT EXISTS (
     SELECT 1 FROM pms_app.project_registry r
     WHERE lower(btrim(r.title)) = src.label
   )`,
  `CREATE OR REPLACE FUNCTION pms_app.projects_write() RETURNS trigger AS $$
   DECLARE
     label text;
     project_id uuid;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       DELETE FROM pms_app.project_registry WHERE id = OLD.id;
       RETURN OLD;
     END IF;
     label := lower(btrim(COALESCE(NEW.title, '')));
     project_id := pms_app.app_uuid('project', CASE WHEN label = '' THEN 'internal work' ELSE label END);
     IF TG_OP = 'INSERT' THEN
       INSERT INTO pms_app.project_registry (
         id, project_code, title, customer_name, lead_id, feasibility_id, costing_id, costing_version_id,
         status, priority, project_manager_id, start_date, target_date, description, site_location,
         customer_contact, approved_value, project_type, created_by
       ) VALUES (
         project_id,
         COALESCE(NULLIF(NEW.project_code, ''), 'PRJ-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('pms_app.project_code_seq')::text, 4, '0')),
         COALESCE(NULLIF(btrim(NEW.title), ''), 'Project'),
         COALESCE(NEW.customer_name, ''),
         NEW.lead_id, NEW.feasibility_id, NEW.costing_id, NEW.costing_version_id,
         COALESCE(NULLIF(NEW.status, ''), 'READY_FOR_EXECUTION'),
         COALESCE(NULLIF(NEW.priority, ''), 'MEDIUM'),
         NEW.project_manager_id, NEW.start_date, NEW.target_date,
         COALESCE(NEW.description, ''), COALESCE(NEW.site_location, ''), COALESCE(NEW.customer_contact, ''),
         NEW.approved_value, COALESCE(NEW.project_type, ''), NEW.created_by
       )
       ON CONFLICT (id) DO UPDATE SET
         lead_id = COALESCE(pms_app.project_registry.lead_id, EXCLUDED.lead_id),
         feasibility_id = COALESCE(pms_app.project_registry.feasibility_id, EXCLUDED.feasibility_id),
         costing_id = COALESCE(pms_app.project_registry.costing_id, EXCLUDED.costing_id),
         costing_version_id = COALESCE(pms_app.project_registry.costing_version_id, EXCLUDED.costing_version_id),
         updated_at = NOW();
       RETURN (SELECT v FROM pms_app.projects v WHERE v.id = project_id LIMIT 1);
     END IF;
     UPDATE pms_app.project_registry SET
       status = COALESCE(NULLIF(NEW.status, ''), status),
       priority = COALESCE(NULLIF(NEW.priority, ''), priority),
       project_manager_id = COALESCE(NEW.project_manager_id, project_manager_id),
       start_date = COALESCE(NEW.start_date, start_date),
       target_date = COALESCE(NEW.target_date, target_date),
       completion_date = COALESCE(NEW.completion_date, completion_date),
       description = COALESCE(NEW.description, description),
       site_location = COALESCE(NEW.site_location, site_location),
       customer_contact = COALESCE(NEW.customer_contact, customer_contact),
       hold_reason = COALESCE(NEW.hold_reason, hold_reason),
       risk_reason = COALESCE(NEW.risk_reason, risk_reason),
       completion_remarks = COALESCE(NEW.completion_remarks, completion_remarks),
       assignment_type = COALESCE(NEW.assignment_type, assignment_type),
       assigned_to_id = COALESCE(NEW.assigned_to_id, assigned_to_id),
       assigned_team_id = COALESCE(NEW.assigned_team_id, assigned_team_id),
       team_review_status = COALESCE(NEW.team_review_status, team_review_status),
       team_reviewed_by = COALESCE(NEW.team_reviewed_by, team_reviewed_by),
       handover_notes = COALESCE(NEW.handover_notes, handover_notes),
       handover_at = COALESCE(NEW.handover_at, handover_at),
       updated_at = NOW()
     WHERE id = OLD.id;
     RETURN (SELECT v FROM pms_app.projects v WHERE v.id = OLD.id LIMIT 1);
   END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS projects_write ON pms_app.projects`,
  `CREATE TRIGGER projects_write
   INSTEAD OF INSERT OR UPDATE OR DELETE ON pms_app.projects
   FOR EACH ROW EXECUTE FUNCTION pms_app.projects_write()`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'products' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.products'; END IF;
   END $$`,
  `CREATE SEQUENCE IF NOT EXISTS pms_app.product_code_seq`,
  `CREATE TABLE IF NOT EXISTS pms_app.products (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     product_code VARCHAR(40) NOT NULL UNIQUE,
     name VARCHAR(200) NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     team_code VARCHAR(40) NOT NULL DEFAULT '',
     department VARCHAR(120) NOT NULL DEFAULT '',
     lead_id UUID,
     status VARCHAR(40) NOT NULL DEFAULT 'PLANNING',
     priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     start_date DATE,
     end_date DATE,
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'project_phases' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.project_phases'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_phases (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID,
     name VARCHAR(200) NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     start_date DATE,
     end_date DATE,
     sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'project_teams' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.project_teams'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_teams (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID NOT NULL,
     team_id UUID NOT NULL,
     team_role VARCHAR(40) NOT NULL DEFAULT 'SUPPORTING',
     contribution_percent INTEGER NOT NULL DEFAULT 0,
     assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (project_id, team_id)
   )`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'project_time_entries' AND c.relkind = 'v'
     ) THEN
       EXECUTE 'DROP VIEW pms_app.project_time_entries';
     END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_time_entries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID,
     task_id UUID,
     user_id UUID,
     hours NUMERIC(8, 2) NOT NULL,
     work_date DATE NOT NULL,
     billable BOOLEAN NOT NULL DEFAULT TRUE,
     note TEXT NOT NULL DEFAULT '',
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     start_at TIMESTAMPTZ,
     end_at TIMESTAMPTZ,
     duration_minutes INTEGER,
     daily_work_update_id UUID
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_time_entries_daily_work_idx
   ON pms_app.project_time_entries (daily_work_update_id) WHERE daily_work_update_id IS NOT NULL`,
  `CREATE OR REPLACE VIEW pms_app.project_tasks AS
   SELECT
     pms_app.app_uuid('task', COALESCE(NULLIF(k.record_key, ''), k.id::text)) AS id,
     pms_app.app_uuid('project', CASE WHEN btrim(COALESCE(k.project_name, '')) = '' THEN 'internal work' ELSE lower(btrim(k.project_name)) END) AS project_id,
     NULL::uuid AS phase_id,
     ('TSK-' || k.id::text)::varchar(20) AS task_code,
     COALESCE(NULLIF(btrim(k.title), ''), 'Task')::varchar(200) AS title,
     COALESCE(k.description, '') AS description,
     pms_app.app_uuid('user', k.assigned_to_id) AS assignee_id,
     COALESCE(tm.code, '')::varchar(40) AS team_code,
     CASE upper(COALESCE(k.priority, 'MEDIUM'))
       WHEN 'LOW' THEN 'LOW' WHEN 'HIGH' THEN 'HIGH' WHEN 'CRITICAL' THEN 'CRITICAL' ELSE 'MEDIUM'
     END::varchar(20) AS priority,
     CASE upper(COALESCE(k.status, ''))
       WHEN 'DONE' THEN 'COMPLETED' WHEN 'COMPLETED' THEN 'COMPLETED'
       WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS' WHEN 'BLOCKED' THEN 'BLOCKED'
       WHEN 'ON_HOLD' THEN 'ON_HOLD' WHEN 'CANCELLED' THEN 'CANCELLED'
       ELSE 'NOT_STARTED'
     END::varchar(40) AS status,
     COALESCE(pms_app.as_date(k.start_date), k.created_at::date, CURRENT_DATE) AS start_date,
     GREATEST(
       COALESCE(pms_app.as_date(k.start_date), k.created_at::date, CURRENT_DATE),
       COALESCE(pms_app.as_date(k.due_date), pms_app.as_date(k.start_date), k.created_at::date, CURRENT_DATE)
     ) AS end_date,
     NULL::date AS baseline_start,
     NULL::date AS baseline_end,
     NULL::numeric AS estimated_hours,
     LEAST(100, GREATEST(0, COALESCE(k.progress_percent, 0)))::smallint AS progress,
     k.id AS sort_order,
     CASE WHEN creator.user_key IS NOT NULL THEN pms_app.app_uuid('user', k.created_by_id) ELSE NULL END AS created_by,
     k.created_at,
     COALESCE(k.updated_at, k.created_at) AS updated_at,
     ''::text AS tags,
     NULL::uuid AS product_id,
     CASE WHEN creator.user_key IS NOT NULL THEN pms_app.app_uuid('user', k.created_by_id) ELSE NULL END AS assigned_by,
     'ACCEPTED'::varchar(40) AS assignment_status,
     COALESCE(k.updated_at, k.created_at) AS accepted_at,
     NULL::timestamptz AS rejected_at,
     ''::text AS rejection_reason
   FROM public.tasks k
   JOIN public.users assignee ON assignee.user_key = k.assigned_to_id
   LEFT JOIN public.teams tm ON tm.record_key = k.team_id
   LEFT JOIN public.users creator ON creator.user_key = k.created_by_id`,
  `CREATE OR REPLACE VIEW pms_app.leads AS
   SELECT
     pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text)) AS id,
     COALESCE(NULLIF(l.lead_number, ''), 'LEAD-' || l.id::text)::varchar(20) AS lead_code,
     COALESCE(NULLIF(btrim(l.title), ''), 'Lead')::varchar(200) AS title,
     COALESCE(l.customer_name, '')::varchar(200) AS customer_name,
     COALESCE(l.customer_type, '')::varchar(80) AS customer_type,
     COALESCE(l.business_vertical, '')::varchar(120) AS business_vertical,
     pms_app.app_uuid('user', creator.user_key) AS created_by,
     COALESCE(NULLIF(l.priority, ''), 'Medium')::varchar(20) AS priority,
     pms_app.as_date(l.expected_decision_date) AS expected_decision_date,
     CASE upper(COALESCE(l.status, ''))
       WHEN 'SUBMITTED_TO_PM' THEN 'SUBMITTED_TO_PM'
       WHEN 'PM_REVIEW' THEN 'PM_REVIEW'
       WHEN 'CHANGES_REQUESTED' THEN 'CHANGES_REQUESTED'
       WHEN 'ON_HOLD' THEN 'ON_HOLD'
       WHEN 'REJECTED' THEN 'REJECTED'
       WHEN 'ACCEPTED_FOR_FEASIBILITY' THEN 'FEASIBILITY'
       WHEN 'FEASIBILITY_IN_PROGRESS' THEN 'FEASIBILITY'
       WHEN 'FEASIBILITY_SUBMITTED' THEN 'FEASIBILITY_SUBMITTED'
       WHEN 'FEASIBILITY_APPROVED' THEN 'FEASIBILITY_APPROVED'
       WHEN 'NEGOTIATION' THEN 'NEGOTIATION'
       WHEN 'QUOTATION' THEN 'QUOTATION'
       WHEN 'WON' THEN 'WON'
       WHEN 'LOST' THEN 'LOST'
       WHEN 'DRAFT' THEN 'DRAFT'
       ELSE COALESCE(NULLIF(upper(l.status), ''), 'DRAFT')
     END::varchar(40) AS status,
     CASE upper(COALESCE(NULLIF(l.pipeline_stage, ''), l.status, ''))
       WHEN 'PM_REVIEW' THEN 'PM Review'
       WHEN 'FEASIBILITY' THEN 'Feasibility'
       WHEN 'COSTING' THEN 'Solution & Costing'
       WHEN 'QUOTATION' THEN 'Quotation'
       WHEN 'NEGOTIATION' THEN 'Negotiation'
       ELSE COALESCE(NULLIF(l.pipeline_stage, ''), l.status, '')
     END::varchar(40) AS stage,
     COALESCE(l.customer_contact, '')::varchar(150) AS contact_person,
     COALESCE(l.customer_designation, '')::varchar(150) AS designation,
     COALESCE(l.customer_email, '')::varchar(255) AS email,
     COALESCE(l.customer_phone, '')::varchar(40) AS phone,
     COALESCE(l.customer_location, '') AS office_location,
     COALESCE(l.plant_location, '') AS site_location,
     COALESCE(NULLIF(l.requirement_summary, ''), NULLIF(l.project_description, ''), '') AS description,
     COALESCE(l.detailed_requirement, '') AS customer_requirement,
     COALESCE(l.application, '') AS use_case,
     COALESCE(l.production_quantity, '') AS production_quantity,
     COALESCE(l.estimated_opportunity_value::text, '') AS estimated_value,
     COALESCE(l.required_solution, '') AS required_solution,
     COALESCE(l.technical_requirements, '') AS technical_requirements,
     COALESCE(l.commercial_remarks, '') AS commercial_requirements,
     COALESCE(l.competitor_information, '') AS competitor_info,
     COALESCE(l.customer_challenge, '') AS customer_challenge,
     COALESCE(l.additional_notes, '') AS remarks,
     jsonb_build_object(
       'industry', COALESCE(l.industry_process, ''),
       'currentProcess', COALESCE(l.current_process, ''),
       'expectedAutomation', COALESCE(l.expected_automation, ''),
       'customerObjective', COALESCE(l.customer_objective, ''),
       'timeline', COALESCE(l.expected_project_timeline, ''),
       'targetDate', COALESCE(l.customer_target_date, ''),
       'productionRate', COALESCE(l.production_rate, ''),
       'cycleTime', COALESCE(l.cycle_time, ''),
       'shiftPattern', COALESCE(l.shift_pattern, ''),
       'operatingHours', COALESCE(l.operating_hours, ''),
       'existingEquipment', COALESCE(l.existing_equipment, ''),
       'existingAutomation', COALESCE(l.existing_automation, ''),
       'integrationRequirements', COALESCE(l.integration_requirements, ''),
       'machineDimensions', COALESCE(l.machine_dimensions, ''),
       'payload', COALESCE(l.payload, ''),
       'accuracy', COALESCE(l.accuracy_requirement, ''),
       'environment', COALESCE(l.environment_conditions, ''),
       'budget', COALESCE(l.customer_budget, ''),
       'expectedPoDate', COALESCE(l.expected_po_date, ''),
       'technicalSpecifications', COALESCE(l.technical_specifications, ''),
       'technicalAssumptions', COALESCE(l.technical_assumptions, ''),
       'customerDependencies', COALESCE(l.customer_dependencies, ''),
       'requiredDocumentsNotes', COALESCE(l.required_documents, '')
     ) AS details,
     COALESCE(l.custom_fields, '{}'::jsonb) AS custom_fields,
     COALESCE(l.visit_requirement, '') AS visit_requirement,
     l.submitted_at AS submitted_to_pm_at,
     CASE WHEN submitter.user_key IS NOT NULL THEN pms_app.app_uuid('user', l.submitted_by_id) ELSE NULL END AS submitted_by,
     l.reviewed_at AS pm_reviewed_at,
     NULL::uuid AS pm_reviewed_by,
     COALESCE(l.pm_review_notes, '') AS pm_note,
     'BUSINESS'::varchar(20) AS source,
     CASE WHEN team.record_key IS NOT NULL THEN pms_app.app_uuid('team', l.assigned_team_id) ELSE NULL END AS assigned_team_id,
     CASE WHEN lead_user.user_key IS NOT NULL THEN pms_app.app_uuid('user', l.assigned_team_lead_id) ELSE NULL END AS assigned_lead_id,
     CASE WHEN assigner.user_key IS NOT NULL THEN pms_app.app_uuid('user', l.assigned_by_id) ELSE NULL END AS assigned_by,
     l.assigned_at,
     ''::text AS assignment_notes,
     l.created_at,
     COALESCE(l.updated_at, l.created_at) AS updated_at
   FROM public.leads l
   JOIN LATERAL (
     SELECT u.user_key FROM public.users u
     WHERE u.user_key IN (l.created_by_id, l.submitted_by_id, l.sales_owner_id, l.pm_id, l.current_owner_id)
     ORDER BY CASE u.user_key
       WHEN l.created_by_id THEN 1 WHEN l.submitted_by_id THEN 2
       WHEN l.sales_owner_id THEN 3 WHEN l.pm_id THEN 4 ELSE 5 END
     LIMIT 1
   ) creator ON TRUE
   LEFT JOIN public.users submitter ON submitter.user_key = l.submitted_by_id
   LEFT JOIN public.teams team ON team.record_key = l.assigned_team_id
   LEFT JOIN public.users lead_user ON lead_user.user_key = l.assigned_team_lead_id
   LEFT JOIN public.users assigner ON assigner.user_key = l.assigned_by_id`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'lead_documents' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.lead_documents'; END IF;
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'lead_activity' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.lead_activity'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.lead_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lead_id UUID NOT NULL,
     original_name TEXT NOT NULL DEFAULT '',
     stored_name TEXT NOT NULL DEFAULT '',
     mime_type TEXT NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.lead_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lead_id UUID NOT NULL,
     action TEXT NOT NULL DEFAULT '',
     actor_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE OR REPLACE FUNCTION pms_app.lead_user_key(person uuid) RETURNS text AS $$
     SELECT user_key FROM public.users WHERE pms_app.app_uuid('user', user_key) = person LIMIT 1
   $$ LANGUAGE sql STABLE`,
  `CREATE OR REPLACE FUNCTION pms_app.lead_team_key(team uuid) RETURNS text AS $$
     SELECT record_key FROM public.teams WHERE pms_app.app_uuid('team', record_key) = team LIMIT 1
   $$ LANGUAGE sql STABLE`,
  `CREATE OR REPLACE FUNCTION pms_app.leads_write() RETURNS trigger AS $$
   DECLARE
     source_id integer;
     source_key text;
     creator_key text;
     amount numeric;
   BEGIN
     IF TG_OP = 'DELETE' THEN
       DELETE FROM public.leads
       WHERE pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.id;
       RETURN OLD;
     END IF;
     creator_key := pms_app.lead_user_key(NEW.created_by);
     BEGIN
       amount := NULLIF(NEW.estimated_value, '')::numeric;
     EXCEPTION WHEN invalid_text_representation THEN
       amount := NULL;
     END;
     IF TG_OP = 'INSERT' THEN
       IF creator_key IS NULL THEN
         RAISE EXCEPTION 'Lead creator was not found';
       END IF;
       SELECT COALESCE(MAX(id), 0) + 1 INTO source_id FROM public.leads;
       source_key := 'lead-' || source_id::text || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
       INSERT INTO public.leads (
         id, record_key, lead_number, title, customer_name, customer_type, business_vertical,
         created_by_id, current_owner_id, priority, expected_decision_date, customer_contact,
         customer_designation, customer_email, customer_phone, customer_location, plant_location,
         requirement_summary, project_description, detailed_requirement, application, production_quantity,
         estimated_opportunity_value, required_solution, technical_requirements, commercial_remarks,
         competitor_information, customer_challenge, additional_notes, custom_fields, visit_requirement,
         status, pipeline_stage, industry_process, current_process, expected_automation, customer_objective,
         expected_project_timeline, customer_target_date, production_rate, cycle_time, shift_pattern,
         operating_hours, existing_equipment, existing_automation, integration_requirements, machine_dimensions,
         payload, accuracy_requirement, environment_conditions, customer_budget, expected_po_date,
         technical_specifications, technical_assumptions, customer_dependencies, required_documents,
         created_at, updated_at
       ) VALUES (
         source_id, source_key, NULLIF(NEW.lead_code, ''), NEW.title, NEW.customer_name, NEW.customer_type,
         NEW.business_vertical, creator_key, creator_key, COALESCE(NULLIF(NEW.priority, ''), 'Medium'),
         NEW.expected_decision_date::text, NEW.contact_person, NEW.designation, NEW.email, NEW.phone,
         NEW.office_location, NEW.site_location, NEW.description, NEW.description, NEW.customer_requirement,
         NEW.use_case, NEW.production_quantity, amount, NEW.required_solution, NEW.technical_requirements,
         NEW.commercial_requirements, NEW.competitor_info, NEW.customer_challenge, NEW.remarks,
         COALESCE(NEW.custom_fields, '{}'::jsonb), NEW.visit_requirement, COALESCE(NULLIF(NEW.status, ''), 'DRAFT'),
         COALESCE(NULLIF(NEW.stage, ''), 'Draft'),
         COALESCE(NEW.details->>'industry', ''), COALESCE(NEW.details->>'currentProcess', ''),
         COALESCE(NEW.details->>'expectedAutomation', ''), COALESCE(NEW.details->>'customerObjective', ''),
         COALESCE(NEW.details->>'timeline', ''), COALESCE(NEW.details->>'targetDate', ''),
         COALESCE(NEW.details->>'productionRate', ''), COALESCE(NEW.details->>'cycleTime', ''),
         COALESCE(NEW.details->>'shiftPattern', ''), COALESCE(NEW.details->>'operatingHours', ''),
         COALESCE(NEW.details->>'existingEquipment', ''), COALESCE(NEW.details->>'existingAutomation', ''),
         COALESCE(NEW.details->>'integrationRequirements', ''), COALESCE(NEW.details->>'machineDimensions', ''),
         COALESCE(NEW.details->>'payload', ''), COALESCE(NEW.details->>'accuracy', ''),
         COALESCE(NEW.details->>'environment', ''), COALESCE(NEW.details->>'budget', ''),
         COALESCE(NEW.details->>'expectedPoDate', ''), COALESCE(NEW.details->>'technicalSpecifications', ''),
         COALESCE(NEW.details->>'technicalAssumptions', ''), COALESCE(NEW.details->>'customerDependencies', ''),
         COALESCE(NEW.details->>'requiredDocumentsNotes', ''), NOW(), NOW()
       );
       RETURN (SELECT v FROM pms_app.leads v WHERE v.id = pms_app.app_uuid('lead', source_key));
     END IF;
     UPDATE public.leads SET
       title = NEW.title,
       customer_name = NEW.customer_name,
       customer_type = NEW.customer_type,
       business_vertical = NEW.business_vertical,
       priority = COALESCE(NULLIF(NEW.priority, ''), priority),
       expected_decision_date = NEW.expected_decision_date::text,
       customer_contact = NEW.contact_person,
       customer_designation = NEW.designation,
       customer_email = NEW.email,
       customer_phone = NEW.phone,
       customer_location = NEW.office_location,
       plant_location = NEW.site_location,
       requirement_summary = NEW.description,
       project_description = NEW.description,
       detailed_requirement = NEW.customer_requirement,
       application = NEW.use_case,
       production_quantity = NEW.production_quantity,
       estimated_opportunity_value = amount,
       required_solution = NEW.required_solution,
       technical_requirements = NEW.technical_requirements,
       commercial_remarks = NEW.commercial_requirements,
       competitor_information = NEW.competitor_info,
       customer_challenge = NEW.customer_challenge,
       additional_notes = NEW.remarks,
       custom_fields = COALESCE(NEW.custom_fields, custom_fields),
       visit_requirement = NEW.visit_requirement,
       status = COALESCE(NULLIF(NEW.status, ''), status),
       pipeline_stage = COALESCE(NULLIF(NEW.stage, ''), pipeline_stage),
       submitted_at = COALESCE(NEW.submitted_to_pm_at, submitted_at),
       submitted_by_id = COALESCE(pms_app.lead_user_key(NEW.submitted_by), submitted_by_id),
       reviewed_at = COALESCE(NEW.pm_reviewed_at, reviewed_at),
       pm_review_notes = COALESCE(NEW.pm_note, pm_review_notes),
       assigned_team_id = COALESCE(pms_app.lead_team_key(NEW.assigned_team_id), assigned_team_id),
       assigned_team_lead_id = COALESCE(pms_app.lead_user_key(NEW.assigned_lead_id), assigned_team_lead_id),
       assigned_by_id = COALESCE(pms_app.lead_user_key(NEW.assigned_by), assigned_by_id),
       assigned_at = COALESCE(NEW.assigned_at, assigned_at),
       industry_process = COALESCE(NEW.details->>'industry', industry_process),
       current_process = COALESCE(NEW.details->>'currentProcess', current_process),
       expected_automation = COALESCE(NEW.details->>'expectedAutomation', expected_automation),
       customer_objective = COALESCE(NEW.details->>'customerObjective', customer_objective),
       expected_project_timeline = COALESCE(NEW.details->>'timeline', expected_project_timeline),
       customer_target_date = COALESCE(NEW.details->>'targetDate', customer_target_date),
       production_rate = COALESCE(NEW.details->>'productionRate', production_rate),
       cycle_time = COALESCE(NEW.details->>'cycleTime', cycle_time),
       shift_pattern = COALESCE(NEW.details->>'shiftPattern', shift_pattern),
       operating_hours = COALESCE(NEW.details->>'operatingHours', operating_hours),
       existing_equipment = COALESCE(NEW.details->>'existingEquipment', existing_equipment),
       existing_automation = COALESCE(NEW.details->>'existingAutomation', existing_automation),
       integration_requirements = COALESCE(NEW.details->>'integrationRequirements', integration_requirements),
       machine_dimensions = COALESCE(NEW.details->>'machineDimensions', machine_dimensions),
       payload = COALESCE(NEW.details->>'payload', payload),
       accuracy_requirement = COALESCE(NEW.details->>'accuracy', accuracy_requirement),
       environment_conditions = COALESCE(NEW.details->>'environment', environment_conditions),
       customer_budget = COALESCE(NEW.details->>'budget', customer_budget),
       expected_po_date = COALESCE(NEW.details->>'expectedPoDate', expected_po_date),
       technical_specifications = COALESCE(NEW.details->>'technicalSpecifications', technical_specifications),
       technical_assumptions = COALESCE(NEW.details->>'technicalAssumptions', technical_assumptions),
       customer_dependencies = COALESCE(NEW.details->>'customerDependencies', customer_dependencies),
       required_documents = COALESCE(NEW.details->>'requiredDocumentsNotes', required_documents),
       updated_at = NOW()
     WHERE pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.id;
     RETURN (SELECT v FROM pms_app.leads v WHERE v.id = OLD.id);
   END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS leads_write ON pms_app.leads`,
  `CREATE TRIGGER leads_write
   INSTEAD OF INSERT OR UPDATE OR DELETE ON pms_app.leads
   FOR EACH ROW EXECUTE FUNCTION pms_app.leads_write()`,
  `CREATE OR REPLACE VIEW pms_app.daily_work_items AS
   SELECT
     pms_app.app_uuid('work-item', d.id::text) AS id,
     CASE WHEN k.id IS NOT NULL THEN pms_app.app_uuid('task', COALESCE(NULLIF(k.record_key, ''), k.id::text)) ELSE NULL END AS task_id,
     COALESCE(NULLIF(btrim(d.task_title), ''), NULLIF(btrim(d.summary), ''), 'Daily work')::varchar(200) AS title,
     pms_app.app_uuid('user', d.user_id) AS employee_id,
     CASE WHEN btrim(COALESCE(d.project_name, k.project_name, '')) = '' THEN NULL
          ELSE pms_app.app_uuid('project', lower(btrim(COALESCE(NULLIF(d.project_name, ''), k.project_name)))) END AS project_id,
     'MEDIUM'::varchar(20) AS priority,
     NULL::date AS deadline,
     pms_app.app_uuid('user', d.user_id) AS created_by,
     d.created_at,
     COALESCE(d.updated_at, d.created_at) AS updated_at
   FROM public.daily_updates d
   JOIN public.users emp ON emp.user_key = d.user_id
   LEFT JOIN LATERAL (
     SELECT task.id, task.record_key, task.project_name FROM public.tasks task
     WHERE task.record_key = d.task_id OR task.id::text = d.task_id
     ORDER BY CASE WHEN task.record_key = d.task_id THEN 0 ELSE 1 END
     LIMIT 1
   ) k ON TRUE`,
  `CREATE OR REPLACE VIEW pms_app.daily_work_updates AS
   SELECT
     pms_app.app_uuid('work-update', d.id::text) AS id,
     pms_app.app_uuid('work-item', d.id::text) AS work_item_id,
     pms_app.app_uuid('user', d.user_id) AS employee_id,
     CASE WHEN btrim(COALESCE(d.project_name, k.project_name, '')) = '' THEN NULL
          ELSE pms_app.app_uuid('project', lower(btrim(COALESCE(NULLIF(d.project_name, ''), k.project_name)))) END AS project_id,
     COALESCE(NULLIF(btrim(d.work_completed), ''), NULLIF(btrim(d.summary), ''), NULLIF(btrim(d.task_title), ''), 'Update') AS description,
     CASE upper(COALESCE(d.work_status, ''))
       WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'
       WHEN 'BLOCKED' THEN 'BLOCKED' WHEN 'ON_HOLD' THEN 'ON_HOLD'
       WHEN 'NOT_STARTED' THEN 'NOT_STARTED' ELSE 'IN_PROGRESS'
     END::varchar(30) AS status,
     'MEDIUM'::varchar(20) AS priority,
     pms_app.as_date(d.work_date) AS update_date,
     NULL::date AS task_deadline,
     CASE WHEN upper(COALESCE(d.work_status, '')) = 'COMPLETED' THEN pms_app.as_date(d.work_date) ELSE NULL END AS completion_date,
     0 AS delay_days,
     CASE upper(COALESCE(d.work_status, ''))
       WHEN 'BLOCKED' THEN 'BLOCKED' WHEN 'COMPLETED' THEN 'COMPLETED_ON_TIME' ELSE 'ON_TIME'
     END::varchar(30) AS delay_status,
     COALESCE(d.blocker, '') AS reason_for_delay,
     COALESCE(d.next_plan, '') AS remarks,
     pms_app.app_uuid('user', d.user_id) AS created_by,
     d.created_at,
     COALESCE(d.updated_at, d.created_at) AS updated_at,
     CASE WHEN d.task_id IS NULL OR d.task_id = '' THEN 'INTERNAL' ELSE 'PROJECT_WORK' END::varchar(40) AS work_type,
     COALESCE(NULLIF(btrim(d.task_title), ''), 'Daily work')::varchar(200) AS work_title,
     CASE WHEN team.record_key IS NOT NULL THEN pms_app.app_uuid('team', d.team_id) ELSE NULL END AS team_id,
     NULL::uuid AS product_id,
     COALESCE(d.next_plan, '') AS next_action,
     LEAST(24, GREATEST(0, COALESCE(round(d.hours_worked), 0)))::smallint AS hours,
     0::smallint AS minutes,
     CASE WHEN btrim(COALESCE(d.dependency, '')) = '' THEN '' ELSE 'OTHER' END::varchar(30) AS dependency_type,
     COALESCE(d.dependency, '') AS dependency_details
   FROM public.daily_updates d
   JOIN public.users emp ON emp.user_key = d.user_id
   LEFT JOIN public.teams team ON team.record_key = d.team_id
   LEFT JOIN LATERAL (
     SELECT task.id, task.record_key, task.project_name FROM public.tasks task
     WHERE task.record_key = d.task_id OR task.id::text = d.task_id
     ORDER BY CASE WHEN task.record_key = d.task_id THEN 0 ELSE 1 END
     LIMIT 1
   ) k ON TRUE
   WHERE pms_app.as_date(d.work_date) IS NOT NULL`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'daily_work_dependencies' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.daily_work_dependencies'; END IF;
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'daily_work_activity' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.daily_work_activity'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.daily_work_dependencies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     daily_work_update_id UUID,
     dependency_type VARCHAR(30) NOT NULL DEFAULT '',
     employee_id UUID,
     team_id UUID,
     external_name VARCHAR(200) NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.daily_work_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     work_item_id UUID,
     update_id UUID,
     actor_id UUID,
     action TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'daily_work_attachments' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.daily_work_attachments'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.daily_work_attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     update_id UUID NOT NULL,
     original_name TEXT NOT NULL DEFAULT '',
     stored_name TEXT NOT NULL DEFAULT '',
     mime_type TEXT NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     uploaded_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE OR REPLACE VIEW pms_app.daily_work_types AS
   SELECT code::varchar(40), name::varchar(80), sort_order, is_active
   FROM (VALUES
     ('PROJECT_WORK', 'Project Work', 10, TRUE),
     ('INTERNAL', 'Internal Work', 20, TRUE),
     ('PRODUCT_DEVELOPMENT', 'Product Development', 30, TRUE),
     ('RND', 'R&D', 40, TRUE),
     ('TESTING', 'Testing', 50, TRUE),
     ('RESEARCH', 'Research', 60, TRUE),
     ('CUSTOMER_SUPPORT', 'Customer Support', 70, TRUE),
     ('PROCUREMENT', 'Procurement', 80, TRUE),
     ('DOCUMENTATION', 'Documentation', 90, TRUE),
     ('MEETING', 'Meeting', 100, TRUE),
     ('TRAINING', 'Training', 110, TRUE),
     ('ADMINISTRATION', 'Administration', 120, TRUE),
     ('SALES_SUPPORT', 'Sales Support', 130, TRUE),
     ('TECHNICAL_SUPPORT', 'Technical Support', 140, TRUE),
     ('OTHER', 'Other', 150, TRUE)
   ) AS kind(code, name, sort_order, is_active)`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'team_meetings' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.team_meetings'; END IF;
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'team_activity' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.team_activity'; END IF;
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'organization_activity' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.organization_activity'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.team_meetings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     team_id UUID NOT NULL,
     name VARCHAR(160) NOT NULL,
     platform VARCHAR(20) NOT NULL DEFAULT 'OTHER',
     url TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     is_primary BOOLEAN NOT NULL DEFAULT FALSE,
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS team_meetings_team_idx ON pms_app.team_meetings (team_id)`,
  `CREATE TABLE IF NOT EXISTS pms_app.team_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     team_id UUID NOT NULL,
     actor_id UUID,
     action TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS team_activity_team_idx ON pms_app.team_activity (team_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS pms_app.organization_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_id UUID,
     action TEXT NOT NULL DEFAULT '',
     previous_value TEXT NOT NULL DEFAULT '',
     new_value TEXT NOT NULL DEFAULT '',
     target_user_id UUID,
     target_team_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.role_permissions (
     role_id SMALLINT,
     module TEXT,
     action TEXT
   )`,
  `DELETE FROM pms_app.role_permissions a
   USING pms_app.role_permissions b
   WHERE a.ctid < b.ctid AND a.role_id IS NOT DISTINCT FROM b.role_id
     AND a.module IS NOT DISTINCT FROM b.module AND a.action IS NOT DISTINCT FROM b.action`,
  `CREATE UNIQUE INDEX IF NOT EXISTS role_permissions_key ON pms_app.role_permissions (role_id, module, action)`,
  `CREATE TABLE IF NOT EXISTS pms_app.user_permission_overrides (
     user_id UUID,
     module TEXT,
     action TEXT,
     allowed BOOLEAN
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_reports (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(160) NOT NULL,
     type VARCHAR(40) NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     scope VARCHAR(20) NOT NULL DEFAULT 'ORGANIZATION',
     scope_id UUID,
     status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
     subject VARCHAR(240) NOT NULL DEFAULT '',
     configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
     attachment VARCHAR(10) NOT NULL DEFAULT 'PDF',
     owner_id UUID NOT NULL,
     frequency VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
     send_time VARCHAR(5) NOT NULL DEFAULT '09:00',
     day_of_week SMALLINT,
     day_of_month SMALLINT,
     timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
     next_run_at TIMESTAMPTZ,
     last_sent_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_report_recipients (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     report_id UUID,
     kind VARCHAR(10),
     recipient_type VARCHAR(20),
     user_id UUID,
     team_id UUID,
     email TEXT,
     name TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_report_templates (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(160) NOT NULL,
     type VARCHAR(40) NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
     is_system BOOLEAN NOT NULL DEFAULT FALSE,
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_settings (
     id SMALLINT PRIMARY KEY,
     provider TEXT,
     host TEXT,
     port INTEGER,
     username TEXT,
     password_enc TEXT,
     from_name TEXT,
     from_email TEXT,
     reply_to TEXT,
     secure BOOLEAN,
     updated_by UUID,
     updated_at TIMESTAMPTZ
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_report_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     report_id UUID,
     actor_id UUID,
     action TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.user_presence (
     user_id UUID PRIMARY KEY,
     status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
     last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE OR REPLACE VIEW pms_app.notifications AS
   SELECT
     pms_app.app_uuid('notification', COALESCE(NULLIF(n.record_key, ''), n.id::text)) AS id,
     CASE WHEN u.user_key IS NOT NULL THEN pms_app.app_uuid('user', n.recipient_id) ELSE NULL END AS user_id,
     COALESCE(n.title, '')::varchar(160) AS title,
     COALESCE(n.message, '') AS body,
     COALESCE(n.action_url, '')::varchar(200) AS link,
     n.read_at,
     n.created_at
   FROM public.notifications n
   LEFT JOIN public.users u ON u.user_key = n.recipient_id`,
  `CREATE OR REPLACE FUNCTION pms_app.notifications_write() RETURNS trigger AS $$
   DECLARE
     source_id integer;
     source_key text;
     recipient text;
   BEGIN
     recipient := pms_app.lead_user_key(COALESCE(NEW.user_id, OLD.user_id));
     IF TG_OP = 'INSERT' THEN
       IF recipient IS NULL THEN
         RETURN NULL;
       END IF;
       SELECT COALESCE(MAX(id), 0) + 1 INTO source_id FROM public.notifications;
       source_key := 'notice-' || source_id::text || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
       INSERT INTO public.notifications (id, record_key, recipient_id, title, message, action_url, read_status, created_at)
       VALUES (source_id, source_key, recipient, left(COALESCE(NEW.title, ''), 160), COALESCE(NEW.body, ''), left(COALESCE(NEW.link, ''), 200), FALSE, NOW());
       RETURN (SELECT v FROM pms_app.notifications v WHERE v.id = pms_app.app_uuid('notification', source_key));
     END IF;
     UPDATE public.notifications
     SET read_at = NEW.read_at, read_status = NEW.read_at IS NOT NULL
     WHERE pms_app.app_uuid('notification', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.id
       AND recipient_id = recipient;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS notifications_write ON pms_app.notifications`,
  `CREATE TRIGGER notifications_write
   INSTEAD OF INSERT OR UPDATE ON pms_app.notifications
   FOR EACH ROW EXECUTE FUNCTION pms_app.notifications_write()`,
  `CREATE OR REPLACE VIEW pms_app.conversations AS
   SELECT
     pms_app.app_uuid('conversation', COALESCE(NULLIF(c.record_key, ''), c.id::text)) AS id,
     CASE
       WHEN upper(COALESCE(c.type, '')) IN ('DIRECT', 'DM', 'PRIVATE') THEN 'DIRECT'
       WHEN upper(COALESCE(c.type, '')) IN ('GROUP', 'TEAM', 'PROJECT') THEN 'GROUP'
       ELSE upper(COALESCE(c.type, 'GROUP'))
     END::varchar(20) AS type,
     c.name,
     COALESCE(c.description, '') AS description,
     NULL::varchar(20) AS group_type,
     NULL::uuid AS project_id,
     NULL::uuid AS team_id,
     CASE WHEN owner.user_key IS NOT NULL THEN pms_app.app_uuid('user', c.created_by_id) ELSE NULL END AS created_by,
     c.created_at,
     COALESCE(c.updated_at, c.created_at) AS updated_at
   FROM public.conversations c
   LEFT JOIN public.users owner ON owner.user_key = c.created_by_id
   WHERE c.deleted_at IS NULL`,
  `CREATE OR REPLACE VIEW pms_app.conversation_members AS
   SELECT
     pms_app.app_uuid('participant', COALESCE(NULLIF(p.record_key, ''), p.id::text)) AS id,
     pms_app.app_uuid('conversation', COALESCE(
       (SELECT COALESCE(NULLIF(c.record_key, ''), c.id::text) FROM public.conversations c
        WHERE c.record_key = p.conversation_id OR c.id::text = p.conversation_id LIMIT 1),
       p.conversation_id)) AS conversation_id,
     pms_app.app_uuid('user', p.user_id) AS user_id,
     CASE WHEN upper(COALESCE(p.role, '')) = 'ADMIN' THEN 'ADMIN' ELSE 'MEMBER' END::varchar(20) AS role,
     COALESCE(p.joined_at, NOW()) AS joined_at,
     p.last_read_at
   FROM public.conversation_participants p
   WHERE p.left_at IS NULL`,
  `CREATE OR REPLACE VIEW pms_app.messages AS
   SELECT
     pms_app.app_uuid('chat', COALESCE(NULLIF(m.record_key, ''), m.id::text)) AS id,
     pms_app.app_uuid('conversation', COALESCE(
       (SELECT COALESCE(NULLIF(c.record_key, ''), c.id::text) FROM public.conversations c
        WHERE c.record_key = m.conversation_id OR c.id::text = m.conversation_id LIMIT 1),
       m.conversation_id)) AS conversation_id,
     CASE WHEN sender.user_key IS NOT NULL THEN pms_app.app_uuid('user', m.sender_id) ELSE NULL END AS sender_id,
     COALESCE(m.message, '') AS body,
     NULL::uuid AS reply_to_id,
     NULL::uuid AS project_id,
     NULL::uuid AS task_id,
     NULL::timestamptz AS delivered_at,
     NULL::timestamptz AS edited_at,
     m.deleted_at,
     m.created_at
   FROM public.chat_messages m
   LEFT JOIN public.users sender ON sender.user_key = m.sender_id`,
  `CREATE OR REPLACE VIEW pms_app.forum_threads AS
   SELECT
     pms_app.app_uuid('forum', COALESCE(NULLIF(p.record_key, ''), p.id::text)) AS id,
     COALESCE(NULLIF(btrim(p.title), ''), 'Discussion')::varchar(200) AS title,
     COALESCE(p.body, '') AS body,
     'DISCUSSION'::varchar(20) AS category,
     CASE WHEN p.locked THEN 'CLOSED' ELSE 'OPEN' END::varchar(20) AS status,
     CASE WHEN author.user_key IS NOT NULL THEN pms_app.app_uuid('user', p.author_id) ELSE NULL END AS author_id,
     NULL::uuid AS project_id,
     NULL::uuid AS team_id,
     0 AS view_count,
     COALESCE(p.updated_at, p.created_at, NOW()) AS last_activity_at,
     p.created_at,
     COALESCE(p.updated_at, p.created_at) AS updated_at
   FROM public.forum_posts p
   LEFT JOIN public.users author ON author.user_key = p.author_id
   WHERE p.deleted_at IS NULL`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'forum_follows' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.forum_follows'; END IF;
   END $$`,
  `CREATE TABLE IF NOT EXISTS pms_app.forum_follows (
     user_id UUID NOT NULL,
     thread_id UUID NOT NULL,
     last_read_at TIMESTAMPTZ,
     PRIMARY KEY (thread_id, user_id)
   )`,
  `SELECT 1`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID,
     product_id UUID,
     actor_id UUID,
     action VARCHAR(160) NOT NULL DEFAULT '',
     comment TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_studies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     lead_id UUID NOT NULL UNIQUE,
     status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
     owner_id UUID,
     started_by UUID,
     started_at TIMESTAMPTZ,
     target_completion_date DATE,
     technical_feasibility TEXT NOT NULL DEFAULT '',
     required_resources TEXT NOT NULL DEFAULT '',
     proposed_solution TEXT NOT NULL DEFAULT '',
     major_constraints TEXT NOT NULL DEFAULT '',
     estimated_timeline TEXT NOT NULL DEFAULT '',
     required_equipment TEXT NOT NULL DEFAULT '',
     technical_assumptions TEXT NOT NULL DEFAULT '',
     team_remarks TEXT NOT NULL DEFAULT '',
     commercial_notes TEXT NOT NULL DEFAULT '',
     commercial_estimate TEXT NOT NULL DEFAULT '',
     decision VARCHAR(40) NOT NULL DEFAULT '',
     overall_conclusion TEXT NOT NULL DEFAULT '',
     conditions TEXT NOT NULL DEFAULT '',
     major_risks TEXT NOT NULL DEFAULT '',
     recommended_next_step VARCHAR(80) NOT NULL DEFAULT '',
     pm_remarks TEXT NOT NULL DEFAULT '',
     completion_date DATE,
     prepared_by UUID,
     prepared_at TIMESTAMPTZ,
     reviewed_by UUID,
     reviewed_at TIMESTAMPTZ,
     approved_by UUID,
     approved_at TIMESTAMPTZ,
     submitted_by UUID,
     submitted_at TIMESTAMPTZ,
     review_note TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_validations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL UNIQUE REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     sample_available VARCHAR(20) NOT NULL DEFAULT 'No',
     sample_received_date DATE,
     sample_quantity TEXT NOT NULL DEFAULT '',
     test_required TEXT NOT NULL DEFAULT '',
     test_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED',
     test_method TEXT NOT NULL DEFAULT '',
     test_result TEXT NOT NULL DEFAULT '',
     required_accuracy TEXT NOT NULL DEFAULT '',
     achieved_accuracy TEXT NOT NULL DEFAULT '',
     required_cycle_time TEXT NOT NULL DEFAULT '',
     achieved_cycle_time TEXT NOT NULL DEFAULT '',
     validation_remarks TEXT NOT NULL DEFAULT '',
     sample_status VARCHAR(30) NOT NULL DEFAULT 'NOT_RECEIVED',
     sample_type TEXT NOT NULL DEFAULT '',
     sample_condition TEXT NOT NULL DEFAULT '',
     sample_location TEXT NOT NULL DEFAULT '',
     sample_owner TEXT NOT NULL DEFAULT '',
     sample_remarks TEXT NOT NULL DEFAULT '',
     tests JSONB NOT NULL DEFAULT '[]'::jsonb
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_team_assignments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     team_code VARCHAR(40) NOT NULL,
     team_lead_id UUID,
     assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
     due_date DATE,
     status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
     completion_percent SMALLINT NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (feasibility_id, team_code)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_team_members (
     assignment_id UUID NOT NULL REFERENCES pms_app.feasibility_team_assignments (id) ON DELETE CASCADE,
     user_id UUID NOT NULL,
     PRIMARY KEY (assignment_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_assessments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     assignment_id UUID NOT NULL UNIQUE REFERENCES pms_app.feasibility_team_assignments (id) ON DELETE CASCADE,
     technical_assessment TEXT NOT NULL DEFAULT '',
     required_resources TEXT NOT NULL DEFAULT '',
     proposed_approach TEXT NOT NULL DEFAULT '',
     constraints TEXT NOT NULL DEFAULT '',
     required_components TEXT NOT NULL DEFAULT '',
     technical_assumptions TEXT NOT NULL DEFAULT '',
     risks TEXT NOT NULL DEFAULT '',
     remarks TEXT NOT NULL DEFAULT '',
     specialty JSONB NOT NULL DEFAULT '{}'::jsonb,
     updated_by UUID,
     reviewed_by UUID,
     reviewed_at TIMESTAMPTZ,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_requirements (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     parameter VARCHAR(160) NOT NULL DEFAULT '',
     customer_requirement TEXT NOT NULL DEFAULT '',
     proposed TEXT NOT NULL DEFAULT '',
     unit VARCHAR(40) NOT NULL DEFAULT '',
     status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VALIDATION',
     remarks TEXT NOT NULL DEFAULT '',
     sort_order SMALLINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_risks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     risk TEXT NOT NULL DEFAULT '',
     category VARCHAR(80) NOT NULL DEFAULT '',
     impact VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     probability VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     mitigation TEXT NOT NULL DEFAULT '',
     owner_id UUID,
     target_date DATE,
     status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
     sort_order SMALLINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_customer_inputs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     information_required TEXT NOT NULL DEFAULT '',
     requested_from VARCHAR(150) NOT NULL DEFAULT '',
     requested_date DATE,
     expected_date DATE,
     status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
     remarks TEXT NOT NULL DEFAULT '',
     critical BOOLEAN NOT NULL DEFAULT TRUE,
     sort_order SMALLINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     assignment_id UUID REFERENCES pms_app.feasibility_team_assignments (id) ON DELETE SET NULL,
     original_name VARCHAR(255) NOT NULL,
     stored_name VARCHAR(255) NOT NULL,
     mime_type VARCHAR(120) NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     document_type VARCHAR(40) NOT NULL DEFAULT 'Other',
     uploaded_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_communications (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     occurred_on DATE,
     communication_type VARCHAR(40) NOT NULL DEFAULT 'Email',
     person VARCHAR(150) NOT NULL DEFAULT '',
     subject VARCHAR(200) NOT NULL DEFAULT '',
     summary TEXT NOT NULL DEFAULT '',
     action_required TEXT NOT NULL DEFAULT '',
     next_follow_up DATE,
     remarks TEXT NOT NULL DEFAULT '',
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.feasibility_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     actor_id UUID,
     action VARCHAR(120) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_report_runs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     report_id UUID,
     report_name VARCHAR(160) NOT NULL,
     report_type VARCHAR(40) NOT NULL,
     started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     completed_at TIMESTAMPTZ,
     status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
     subject VARCHAR(240) NOT NULL DEFAULT '',
     error TEXT NOT NULL DEFAULT '',
     attachment VARCHAR(10) NOT NULL DEFAULT 'NONE',
     file_name VARCHAR(200) NOT NULL DEFAULT '',
     file_body BYTEA,
     snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
     sent_by UUID,
     is_test BOOLEAN NOT NULL DEFAULT FALSE,
     attempt_of UUID,
     recipient_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.email_report_deliveries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     run_id UUID,
     kind VARCHAR(8) NOT NULL,
     email VARCHAR(200) NOT NULL,
     name VARCHAR(160) NOT NULL DEFAULT '',
     status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
     error TEXT NOT NULL DEFAULT '',
     sent_at TIMESTAMPTZ
   )`,
  `CREATE SEQUENCE IF NOT EXISTS pms_app.escalation_number_seq START 1`,
  `CREATE TABLE IF NOT EXISTS pms_app.escalations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     escalation_number INTEGER NOT NULL UNIQUE DEFAULT nextval('pms_app.escalation_number_seq'),
     title VARCHAR(200) NOT NULL,
     type VARCHAR(40) NOT NULL,
     priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
     level VARCHAR(20) NOT NULL DEFAULT 'TEAM',
     description TEXT NOT NULL,
     impact_area VARCHAR(30) NOT NULL DEFAULT '',
     impact_severity VARCHAR(20) NOT NULL DEFAULT '',
     recommended_action TEXT NOT NULL DEFAULT '',
     project_id UUID,
     customer_name VARCHAR(200) NOT NULL DEFAULT '',
     team_id UUID,
     raised_by UUID NOT NULL,
     assigned_to UUID,
     task_id UUID,
     work_request_id UUID,
     lead_id UUID,
     feasibility_id UUID,
     costing_id UUID,
     due_date DATE,
     root_cause TEXT NOT NULL DEFAULT '',
     corrective_action TEXT NOT NULL DEFAULT '',
     preventive_action TEXT NOT NULL DEFAULT '',
     resolution_notes TEXT NOT NULL DEFAULT '',
     resolved_by UUID,
     resolved_at TIMESTAMPTZ,
     closed_at TIMESTAMPTZ,
     archived_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.escalation_comments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     escalation_id UUID NOT NULL REFERENCES pms_app.escalations (id) ON DELETE CASCADE,
     user_id UUID NOT NULL,
     message TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.escalation_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     escalation_id UUID NOT NULL REFERENCES pms_app.escalations (id) ON DELETE CASCADE,
     user_id UUID,
     action VARCHAR(80) NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.escalation_attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     escalation_id UUID NOT NULL REFERENCES pms_app.escalations (id) ON DELETE CASCADE,
     file_name VARCHAR(240) NOT NULL,
     stored_name VARCHAR(240) NOT NULL DEFAULT '',
     mime_type VARCHAR(120) NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     uploaded_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.checklists (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     employee_id UUID NOT NULL,
     title VARCHAR(200) NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     visit_date DATE,
     visibility VARCHAR(20) NOT NULL DEFAULT 'EVERYONE',
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.checklist_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     checklist_id UUID NOT NULL REFERENCES pms_app.checklists (id) ON DELETE CASCADE,
     title VARCHAR(200) NOT NULL,
     completed BOOLEAN NOT NULL DEFAULT FALSE,
     sort_order INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.checklist_visibility (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     checklist_id UUID NOT NULL REFERENCES pms_app.checklists (id) ON DELETE CASCADE,
     user_id UUID NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (checklist_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.checklist_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     checklist_id UUID REFERENCES pms_app.checklists (id) ON DELETE SET NULL,
     actor_id UUID,
     action VARCHAR(300) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.organization_calendar (
     id INTEGER PRIMARY KEY DEFAULT 1,
     weekend_days INTEGER[] NOT NULL DEFAULT ARRAY[0, 6],
     CONSTRAINT organization_calendar_single CHECK (id = 1)
   )`,
  `INSERT INTO pms_app.organization_calendar (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS pms_app.organization_holidays (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     holiday_date DATE NOT NULL UNIQUE,
     name VARCHAR(120) NOT NULL,
     is_working_day BOOLEAN NOT NULL DEFAULT FALSE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.leave_types (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name VARCHAR(80) NOT NULL,
     code VARCHAR(40) NOT NULL UNIQUE,
     description TEXT NOT NULL DEFAULT '',
     default_annual_allocation NUMERIC(5, 1) NOT NULL DEFAULT 0,
     is_active BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `INSERT INTO pms_app.leave_types (name, code, description, default_annual_allocation)
   VALUES
     ('Casual', 'CASUAL', 'Casual leave', 12),
     ('Sick', 'SICK', 'Sick leave', 10),
     ('Earned', 'EARNED', 'Earned leave', 12),
     ('Privilege', 'PRIVILEGE', 'Privilege leave', 12),
     ('Compensatory Off', 'COMP_OFF', 'Compensatory off', 0),
     ('Other', 'OTHER', 'Other leave', 0)
   ON CONFLICT (code) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS pms_app.leave_balances (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL,
     leave_type_id UUID NOT NULL REFERENCES pms_app.leave_types (id) ON DELETE CASCADE,
     year INTEGER NOT NULL,
     allocated_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
     used_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
     pending_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (user_id, leave_type_id, year)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.leave_number_counters (
     bucket VARCHAR(20) PRIMARY KEY,
     last_value INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.leave_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_number VARCHAR(20) NOT NULL UNIQUE,
     user_id UUID NOT NULL,
     team_id UUID,
     leave_type_id UUID NOT NULL REFERENCES pms_app.leave_types (id),
     start_date DATE NOT NULL,
     end_date DATE NOT NULL,
     duration_days NUMERIC(5, 1) NOT NULL,
     duration_type VARCHAR(20) NOT NULL DEFAULT 'FULL',
     reason TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     attachment_name VARCHAR(240) NOT NULL DEFAULT '',
     attachment_path VARCHAR(400) NOT NULL DEFAULT '',
     status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
     submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     reviewed_by UUID,
     reviewed_at TIMESTAMPTZ,
     approval_comment TEXT NOT NULL DEFAULT '',
     rejection_reason TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.permission_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_number VARCHAR(20) NOT NULL UNIQUE,
     user_id UUID NOT NULL,
     team_id UUID,
     permission_date DATE NOT NULL,
     start_time TIMESTAMPTZ NOT NULL,
     end_time TIMESTAMPTZ NOT NULL,
     duration_minutes INTEGER NOT NULL,
     reason TEXT NOT NULL,
     note TEXT NOT NULL DEFAULT '',
     status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
     submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     reviewed_by UUID,
     reviewed_at TIMESTAMPTZ,
     approval_comment TEXT NOT NULL DEFAULT '',
     rejection_reason TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.leave_approval_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     leave_request_id UUID NOT NULL REFERENCES pms_app.leave_requests (id) ON DELETE CASCADE,
     action VARCHAR(40) NOT NULL,
     action_by UUID,
     comment TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.permission_approval_history (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     permission_request_id UUID NOT NULL REFERENCES pms_app.permission_requests (id) ON DELETE CASCADE,
     action VARCHAR(40) NOT NULL,
     action_by UUID,
     comment TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE SEQUENCE IF NOT EXISTS pms_app.procurement_request_number_seq START 1`,
  `CREATE TABLE IF NOT EXISTS pms_app.procurement_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_number INTEGER NOT NULL UNIQUE DEFAULT nextval('pms_app.procurement_request_number_seq'),
     title VARCHAR(200) NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
     project_id UUID,
     team_id UUID,
     vendor_name VARCHAR(200) NOT NULL DEFAULT '',
     needed_by DATE,
     justification TEXT NOT NULL DEFAULT '',
     requested_by UUID NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.procurement_request_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id UUID NOT NULL REFERENCES pms_app.procurement_requests (id) ON DELETE CASCADE,
     description VARCHAR(240) NOT NULL,
     quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
     unit VARCHAR(40) NOT NULL DEFAULT '',
     estimated_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.attendance_sessions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL,
     work_date DATE NOT NULL,
     check_in TIMESTAMPTZ NOT NULL,
     check_out TIMESTAMPTZ,
     total_worked_minutes INTEGER,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (user_id, work_date)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.break_entries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attendance_session_id UUID NOT NULL REFERENCES pms_app.attendance_sessions (id) ON DELETE CASCADE,
     start_time TIMESTAMPTZ NOT NULL,
     end_time TIMESTAMPTZ,
     duration_minutes INTEGER,
     break_type VARCHAR(40) NOT NULL DEFAULT 'Break',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.daily_reports (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID NOT NULL,
     report_date DATE NOT NULL,
     what_i_did TEXT NOT NULL DEFAULT '',
     what_to_improve TEXT NOT NULL DEFAULT '',
     notes TEXT NOT NULL DEFAULT '',
     what_i_did_edited BOOLEAN NOT NULL DEFAULT FALSE,
     what_to_improve_edited BOOLEAN NOT NULL DEFAULT FALSE,
     status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
     submitted_at TIMESTAMPTZ,
     submitted_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (user_id, report_date)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.daily_report_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     daily_report_id UUID NOT NULL REFERENCES pms_app.daily_reports (id) ON DELETE CASCADE,
     activity_type VARCHAR(40) NOT NULL,
     reference_id UUID,
     summary TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.team_work_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     team_id UUID NOT NULL,
     requester_id UUID NOT NULL,
     project_id UUID,
     title VARCHAR(200) NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     deadline DATE,
     status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
     assigned_to UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     start_date DATE,
     estimated_minutes INTEGER NOT NULL DEFAULT 0,
     tag VARCHAR(80) NOT NULL DEFAULT '',
     checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
     task_id UUID
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.leave_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id UUID,
     actor_id UUID,
     leave_request_id UUID REFERENCES pms_app.leave_requests (id) ON DELETE SET NULL,
     permission_request_id UUID REFERENCES pms_app.permission_requests (id) ON DELETE SET NULL,
     action VARCHAR(80) NOT NULL,
     comment TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.task_dependencies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID NOT NULL,
     predecessor_id UUID NOT NULL,
     successor_id UUID NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT task_dependencies_distinct CHECK (predecessor_id <> successor_id),
     CONSTRAINT task_dependencies_unique UNIQUE (predecessor_id, successor_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_baselines (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID NOT NULL,
     planned_start DATE,
     planned_end DATE,
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID NOT NULL,
     original_name VARCHAR(240) NOT NULL,
     stored_name VARCHAR(240) NOT NULL,
     mime_type VARCHAR(120) NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     uploaded_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_milestones (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID,
     product_id UUID,
     name VARCHAR(200) NOT NULL,
     milestone_date DATE NOT NULL,
     owner_id UUID,
     description TEXT NOT NULL DEFAULT '',
     status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.workflow_events (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     entity_type VARCHAR(40) NOT NULL,
     entity_id UUID NOT NULL,
     event VARCHAR(80) NOT NULL,
     actor_id UUID,
     note TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.forum_replies (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     thread_id UUID NOT NULL,
     author_id UUID,
     parent_reply_id UUID,
     body TEXT NOT NULL DEFAULT '',
     edited_at TIMESTAMPTZ,
     deleted_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.forum_thread_tags (
     thread_id UUID NOT NULL,
     tag_id UUID NOT NULL,
     PRIMARY KEY (thread_id, tag_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.forum_attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     thread_id UUID,
     reply_id UUID,
     file_name VARCHAR(240) NOT NULL,
     stored_name VARCHAR(240) NOT NULL,
     mime_type VARCHAR(120) NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.forum_reactions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     reply_id UUID NOT NULL,
     user_id UUID NOT NULL,
     emoji VARCHAR(16) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     CONSTRAINT forum_reactions_unique UNIQUE (reply_id, user_id, emoji)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.forum_views (
     thread_id UUID NOT NULL,
     user_id UUID NOT NULL,
     viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (thread_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.message_edits (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL,
     body TEXT NOT NULL DEFAULT '',
     edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE OR REPLACE VIEW pms_app.quotations AS
   SELECT
     pms_app.app_uuid('quote', COALESCE(NULLIF(l.record_key, ''), l.id::text)) AS id,
     pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text)) AS lead_id,
     NULL::uuid AS costing_id,
     GREATEST(COALESCE(l.quotation_revision, 1), 1)::int AS version_no,
     CASE
       WHEN upper(COALESCE(l.quotation_workflow_status, '')) IN ('ACCEPTED', 'WON') OR upper(COALESCE(l.status, '')) = 'WON' THEN 'ACCEPTED'
       WHEN upper(COALESCE(l.quotation_workflow_status, '')) = 'REJECTED' OR upper(COALESCE(l.status, '')) = 'LOST' THEN 'REJECTED'
       WHEN upper(COALESCE(l.quotation_workflow_status, '')) = 'SENT' OR upper(COALESCE(l.status, '')) = 'NEGOTIATION' OR l.quotation_sent_at IS NOT NULL THEN 'SENT'
       ELSE 'DRAFT'
     END::varchar(40) AS status,
     CASE WHEN creator.user_key IS NOT NULL THEN pms_app.app_uuid('user', l.quotation_created_by_id) ELSE NULL END AS prepared_by,
     NULL::uuid AS approved_by,
     CASE WHEN sender.user_key IS NOT NULL THEN pms_app.app_uuid('user', l.quotation_sent_by_id) ELSE NULL END AS sent_by,
     l.quotation_sent_at AS sent_at,
     COALESCE(l.quotation_commercial_terms, '') AS scope,
     l.quotation_value AS price,
     COALESCE(NULLIF(l.currency, ''), 'INR')::varchar(3) AS currency,
     COALESCE(l.quotation_validity, '') AS validity,
     COALESCE(l.quotation_delivery_terms, '') AS delivery_timeline,
     COALESCE(l.quotation_payment_terms, '') AS payment_terms,
     ''::text AS warranty,
     ''::text AS exclusions,
     ''::text AS assumptions,
     ''::text AS taxes,
     COALESCE(l.quotation_commercial_terms, '') AS commercial_terms,
     ''::text AS customer_response,
     COALESCE(l.quotation_created_at, l.updated_at, l.created_at, NOW()) AS created_at
   FROM public.leads l
   LEFT JOIN public.users creator ON creator.user_key = l.quotation_created_by_id
   LEFT JOIN public.users sender ON sender.user_key = l.quotation_sent_by_id
   WHERE l.quotation_sent_at IS NOT NULL
      OR l.quotation_value IS NOT NULL
      OR COALESCE(l.quotation_revision, 0) > 0
      OR upper(COALESCE(l.status, '')) = 'NEGOTIATION'
      OR jsonb_typeof(l.negotiation_history) = 'array'`,
  `CREATE OR REPLACE VIEW pms_app.negotiation_events AS
   SELECT
     pms_app.app_uuid('negotiation', COALESCE(item->>'id', l.id::text || ':' || ordinality::text)) AS id,
     pms_app.app_uuid('quote', COALESCE(NULLIF(l.record_key, ''), l.id::text)) AS quotation_id,
     pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text)) AS lead_id,
     CASE WHEN actor.user_key IS NOT NULL THEN pms_app.app_uuid('user', item->>'created_by_id') ELSE NULL END AS actor_id,
     COALESCE(NULLIF(item->>'status', ''), 'ONGOING')::varchar(40) AS status,
     COALESCE(NULLIF(item->>'customer_feedback', ''), NULLIF(item->>'notes', ''), '') AS discussion,
     COALESCE(item->>'commercial_changes', '') AS price_change,
     COALESCE(item->>'customer_requests', '') AS scope_change,
     ''::text AS timeline_change,
     ''::text AS payment_terms,
     COALESCE(item->>'notes', '') AS remarks,
     COALESCE(NULLIF(item->>'created_at', '')::timestamptz, l.updated_at, NOW()) AS created_at
   FROM public.leads l
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(l.negotiation_history) = 'array' THEN l.negotiation_history ELSE '[]'::jsonb END
   ) WITH ORDINALITY AS items(item, ordinality)
   LEFT JOIN public.users actor ON actor.user_key = item->>'created_by_id'`,
  `CREATE OR REPLACE FUNCTION pms_app.quotations_write() RETURNS trigger AS $$
   DECLARE
     quote_id uuid;
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM public.leads
       WHERE pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = COALESCE(NEW.lead_id, OLD.lead_id)
     ) THEN
       RAISE EXCEPTION 'Quotation lead was not found';
     END IF;
     IF TG_OP = 'INSERT' THEN
       UPDATE public.leads SET
         quotation_revision = GREATEST(COALESCE(NEW.version_no, quotation_revision, 1), 1),
         quotation_value = NEW.price,
         quotation_validity = COALESCE(NEW.validity, quotation_validity, ''),
         quotation_delivery_terms = COALESCE(NULLIF(NEW.delivery_timeline, ''), quotation_delivery_terms, ''),
         quotation_payment_terms = COALESCE(NULLIF(NEW.payment_terms, ''), quotation_payment_terms, ''),
         quotation_commercial_terms = COALESCE(NULLIF(NEW.scope, ''), NULLIF(NEW.commercial_terms, ''), quotation_commercial_terms, ''),
         quotation_created_by_id = COALESCE(pms_app.lead_user_key(NEW.prepared_by), quotation_created_by_id),
         quotation_created_at = COALESCE(quotation_created_at, NOW()),
         quotation_workflow_status = 'DRAFT',
         updated_at = NOW()
       WHERE pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = NEW.lead_id;
     ELSE
       UPDATE public.leads SET
         quotation_sent_at = CASE
           WHEN NEW.status = 'SENT' THEN COALESCE(NEW.sent_at, NOW())
           ELSE quotation_sent_at
         END,
         quotation_sent_by_id = CASE
           WHEN NEW.status = 'SENT' THEN COALESCE(pms_app.lead_user_key(NEW.sent_by), quotation_sent_by_id)
           ELSE quotation_sent_by_id
         END,
         quotation_workflow_status = COALESCE(NULLIF(NEW.status, ''), quotation_workflow_status),
         quotation_submission_remarks = COALESCE(NULLIF(NEW.customer_response, ''), quotation_submission_remarks),
         quotation_value = COALESCE(NEW.price, quotation_value),
         updated_at = NOW()
       WHERE pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.lead_id;
     END IF;
     SELECT pms_app.app_uuid('quote', COALESCE(NULLIF(record_key, ''), id::text)) INTO quote_id
     FROM public.leads
     WHERE pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = COALESCE(NEW.lead_id, OLD.lead_id);
     RETURN (SELECT v FROM pms_app.quotations v WHERE v.id = quote_id LIMIT 1);
   END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS quotations_write ON pms_app.quotations`,
  `CREATE TRIGGER quotations_write
   INSTEAD OF INSERT OR UPDATE ON pms_app.quotations
   FOR EACH ROW EXECUTE FUNCTION pms_app.quotations_write()`,
  `CREATE OR REPLACE FUNCTION pms_app.negotiation_events_write() RETURNS trigger AS $$
   BEGIN
     UPDATE public.leads SET
       negotiation_history = COALESCE(
         CASE WHEN jsonb_typeof(negotiation_history) = 'array' THEN negotiation_history ELSE '[]'::jsonb END,
         '[]'::jsonb
       ) || jsonb_build_array(jsonb_build_object(
         'id', COALESCE(NEW.id::text, gen_random_uuid()::text),
         'status', COALESCE(NEW.status, 'ONGOING'),
         'notes', COALESCE(NEW.discussion, ''),
         'customer_feedback', COALESCE(NEW.discussion, ''),
         'commercial_changes', COALESCE(NEW.price_change, ''),
         'customer_requests', COALESCE(NEW.scope_change, ''),
         'created_by_id', pms_app.lead_user_key(NEW.actor_id),
         'created_at', NOW()
       )),
       updated_at = NOW()
     WHERE pms_app.app_uuid('quote', COALESCE(NULLIF(record_key, ''), id::text)) = NEW.quotation_id
        OR pms_app.app_uuid('lead', COALESCE(NULLIF(record_key, ''), id::text)) = NEW.lead_id;
     IF NOT FOUND THEN
       RAISE EXCEPTION 'Negotiation lead was not found';
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS negotiation_events_write ON pms_app.negotiation_events`,
  `CREATE TRIGGER negotiation_events_write
   INSTEAD OF INSERT ON pms_app.negotiation_events
   FOR EACH ROW EXECUTE FUNCTION pms_app.negotiation_events_write()`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'solution_costings' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.solution_costings'; END IF;
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'solution_costing_versions' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.solution_costing_versions'; END IF;
     IF EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'pms_app' AND c.relname = 'solution_costing_teams' AND c.relkind = 'v'
     ) THEN EXECUTE 'DROP VIEW pms_app.solution_costing_teams'; END IF;
   END $$`,
  `CREATE SEQUENCE IF NOT EXISTS pms_app.costing_code_seq START 1`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     costing_code VARCHAR(20),
     feasibility_id UUID NOT NULL REFERENCES pms_app.feasibility_studies (id) ON DELETE CASCADE,
     lead_id UUID NOT NULL,
     status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
     owner_id UUID,
     currency VARCHAR(3) NOT NULL DEFAULT 'INR',
     created_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS solution_costings_feasibility_idx ON pms_app.solution_costings (feasibility_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS solution_costings_code_idx ON pms_app.solution_costings (costing_code) WHERE costing_code IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_versions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     costing_id UUID NOT NULL REFERENCES pms_app.solution_costings (id) ON DELETE CASCADE,
     version_no INTEGER NOT NULL,
     status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
     is_current BOOLEAN NOT NULL DEFAULT TRUE,
     solution_name TEXT NOT NULL DEFAULT '',
     solution_description TEXT NOT NULL DEFAULT '',
     automation_concept TEXT NOT NULL DEFAULT '',
     process_flow TEXT NOT NULL DEFAULT '',
     system_architecture TEXT NOT NULL DEFAULT '',
     key_assumptions TEXT NOT NULL DEFAULT '',
     scope_of_supply TEXT NOT NULL DEFAULT '',
     customer_scope TEXT NOT NULL DEFAULT '',
     careyu_scope TEXT NOT NULL DEFAULT '',
     third_party_scope TEXT NOT NULL DEFAULT '',
     exclusions TEXT NOT NULL DEFAULT '',
     commercial_assumptions TEXT NOT NULL DEFAULT '',
     technical_assumptions TEXT NOT NULL DEFAULT '',
     customer_dependencies TEXT NOT NULL DEFAULT '',
     architecture_input TEXT NOT NULL DEFAULT '',
     architecture_process TEXT NOT NULL DEFAULT '',
     architecture_inspection TEXT NOT NULL DEFAULT '',
     architecture_decision TEXT NOT NULL DEFAULT '',
     architecture_output TEXT NOT NULL DEFAULT '',
     contingency_percent NUMERIC(8, 2) NOT NULL DEFAULT 0,
     overhead_percent NUMERIC(8, 2) NOT NULL DEFAULT 0,
     overhead_base VARCHAR(20) NOT NULL DEFAULT 'SUBTOTAL',
     margin_percent NUMERIC(8, 2) NOT NULL DEFAULT 0,
     tax_percent NUMERIC(8, 2) NOT NULL DEFAULT 18,
     currency VARCHAR(3) NOT NULL DEFAULT 'INR',
     component_lead_time TEXT NOT NULL DEFAULT '',
     engineering_duration TEXT NOT NULL DEFAULT '',
     fabrication_duration TEXT NOT NULL DEFAULT '',
     assembly_duration TEXT NOT NULL DEFAULT '',
     testing_duration TEXT NOT NULL DEFAULT '',
     installation_duration TEXT NOT NULL DEFAULT '',
     commissioning_duration TEXT NOT NULL DEFAULT '',
     estimated_duration TEXT NOT NULL DEFAULT '',
     payment_terms TEXT NOT NULL DEFAULT '',
     delivery_terms TEXT NOT NULL DEFAULT '',
     warranty TEXT NOT NULL DEFAULT '',
     validity TEXT NOT NULL DEFAULT '',
     installation_terms TEXT NOT NULL DEFAULT '',
     rejection_reason TEXT NOT NULL DEFAULT '',
     totals JSONB NOT NULL DEFAULT '{}'::jsonb,
     submitted_by UUID,
     submitted_at TIMESTAMPTZ,
     reviewed_by UUID,
     reviewed_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     UNIQUE (costing_id, version_no)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_components (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     category VARCHAR(40) NOT NULL DEFAULT 'Other',
     name TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     sort_order SMALLINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_bom_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     item_no INTEGER NOT NULL DEFAULT 1,
     category VARCHAR(40) NOT NULL DEFAULT 'Miscellaneous',
     component TEXT NOT NULL DEFAULT '',
     description TEXT NOT NULL DEFAULT '',
     specification TEXT NOT NULL DEFAULT '',
     manufacturer TEXT NOT NULL DEFAULT '',
     part_number TEXT NOT NULL DEFAULT '',
     supplier TEXT NOT NULL DEFAULT '',
     quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
     unit VARCHAR(40) NOT NULL DEFAULT 'Nos',
     unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
     lead_time TEXT NOT NULL DEFAULT '',
     remarks TEXT NOT NULL DEFAULT '',
     quotation_reference TEXT NOT NULL DEFAULT '',
     quoted_price NUMERIC(14, 2),
     quote_date DATE,
     quote_validity DATE,
     purchase_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUESTED',
     sort_order SMALLINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_cost_entries (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     section VARCHAR(40) NOT NULL,
     line_key VARCHAR(60) NOT NULL,
     label VARCHAR(120) NOT NULL,
     mode VARCHAR(20) NOT NULL DEFAULT 'AMOUNT',
     hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
     rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
     amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
     sort_order SMALLINT NOT NULL DEFAULT 0,
     UNIQUE (version_id, line_key)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_risks (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     risk TEXT NOT NULL DEFAULT '',
     impact VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     probability VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
     mitigation TEXT NOT NULL DEFAULT '',
     cost_impact NUMERIC(14, 2) NOT NULL DEFAULT 0,
     owner_id UUID,
     sort_order SMALLINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_teams (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     team_code VARCHAR(40) NOT NULL,
     contribution TEXT NOT NULL DEFAULT '',
     estimated_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
     members TEXT NOT NULL DEFAULT '',
     status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
     UNIQUE (version_id, team_code)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_documents (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     original_name VARCHAR(255) NOT NULL,
     stored_name VARCHAR(255) NOT NULL DEFAULT '',
     mime_type VARCHAR(120) NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     document_type VARCHAR(40) NOT NULL DEFAULT 'Other',
     uploaded_by UUID,
     source_feasibility_id UUID,
     source_document_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_approvals (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     version_id UUID NOT NULL REFERENCES pms_app.solution_costing_versions (id) ON DELETE CASCADE,
     actor_id UUID,
     decision VARCHAR(40) NOT NULL,
     comments TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_audit (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     costing_id UUID NOT NULL REFERENCES pms_app.solution_costings (id) ON DELETE CASCADE,
     version_id UUID REFERENCES pms_app.solution_costing_versions (id) ON DELETE SET NULL,
     actor_id UUID,
     field_name TEXT NOT NULL DEFAULT '',
     previous_value TEXT NOT NULL DEFAULT '',
     new_value TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.solution_costing_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     costing_id UUID NOT NULL REFERENCES pms_app.solution_costings (id) ON DELETE CASCADE,
     version_id UUID REFERENCES pms_app.solution_costing_versions (id) ON DELETE SET NULL,
     actor_id UUID,
     action VARCHAR(160) NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `INSERT INTO pms_app.feasibility_studies (
     lead_id, status, decision, technical_feasibility, required_resources, proposed_solution,
     major_constraints, estimated_timeline, required_equipment, technical_assumptions, team_remarks,
     commercial_notes, recommended_next_step, started_at, created_at, updated_at
   )
   SELECT
     pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text)),
     CASE upper(COALESCE(l.fs_status, ''))
       WHEN 'APPROVED' THEN 'FEASIBLE'
       WHEN 'SUBMITTED' THEN 'UNDER_REVIEW'
       WHEN 'DRAFT' THEN 'IN_PROGRESS'
       ELSE CASE
         WHEN upper(COALESCE(l.status, '')) IN ('NEGOTIATION', 'QUOTATION', 'WON', 'COSTING', 'COSTING_APPROVED') THEN 'FEASIBLE'
         ELSE 'IN_PROGRESS'
       END
     END,
     CASE
       WHEN upper(COALESCE(l.fs_status, '')) = 'APPROVED' THEN 'FEASIBLE'
       WHEN upper(COALESCE(l.status, '')) IN ('NEGOTIATION', 'QUOTATION', 'WON', 'COSTING', 'COSTING_APPROVED') THEN 'FEASIBLE'
       ELSE ''
     END,
     COALESCE(l.fs_technical_feasibility, ''),
     COALESCE(l.fs_required_resources, ''),
     COALESCE(l.fs_proposed_solution, ''),
     COALESCE(l.fs_major_constraints, ''),
     COALESCE(l.fs_estimated_timeline, ''),
     COALESCE(l.fs_required_equipment, ''),
     COALESCE(l.fs_technical_assumptions, ''),
     COALESCE(l.fs_team_remarks, ''),
     COALESCE(l.costing_commercial_assumptions, ''),
     CASE
       WHEN upper(COALESCE(l.fs_status, '')) = 'APPROVED'
         OR upper(COALESCE(l.status, '')) IN ('NEGOTIATION', 'QUOTATION', 'WON', 'COSTING', 'COSTING_APPROVED')
       THEN 'Proceed to Solution & Costing'
       ELSE ''
     END,
     CASE
       WHEN l.fs_started_at IS NOT NULL OR l.fs_submitted_at IS NOT NULL
         OR btrim(COALESCE(l.fs_status, '')) <> ''
         OR btrim(COALESCE(l.fs_proposed_solution, '')) <> ''
         OR btrim(COALESCE(l.fs_technical_feasibility, '')) <> ''
       THEN COALESCE(l.fs_started_at, l.fs_submitted_at, l.created_at)
       ELSE NULL
     END,
     COALESCE(l.created_at, NOW()),
     COALESCE(l.updated_at, l.created_at, NOW())
   FROM public.leads l
   WHERE upper(COALESCE(l.status, '')) IN (
       'FEASIBILITY_IN_PROGRESS', 'ACCEPTED_FOR_FEASIBILITY', 'NEGOTIATION', 'QUOTATION', 'WON', 'FEASIBILITY',
       'COSTING', 'COSTING_SUBMITTED', 'COSTING_APPROVED', 'FEASIBILITY_APPROVED'
     )
     OR upper(COALESCE(l.pipeline_stage, '')) IN ('FEASIBILITY', 'NEGOTIATION', 'COSTING', 'QUOTATION')
     OR btrim(COALESCE(l.fs_status, '')) <> ''
   ON CONFLICT (lead_id) DO UPDATE SET
     status = CASE
       WHEN pms_app.feasibility_studies.status IN ('FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'REJECTED', 'UNDER_REVIEW')
         THEN pms_app.feasibility_studies.status
       WHEN EXCLUDED.status = 'FEASIBLE' OR EXCLUDED.status = 'UNDER_REVIEW' THEN EXCLUDED.status
       WHEN btrim(COALESCE(EXCLUDED.proposed_solution, '')) <> ''
         OR btrim(COALESCE(EXCLUDED.technical_feasibility, '')) <> ''
         OR EXCLUDED.started_at IS NOT NULL
       THEN EXCLUDED.status
       ELSE pms_app.feasibility_studies.status
     END,
     decision = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.decision, '')) <> '' THEN pms_app.feasibility_studies.decision
       ELSE EXCLUDED.decision
     END,
     technical_feasibility = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.technical_feasibility, '')) <> '' THEN pms_app.feasibility_studies.technical_feasibility
       ELSE EXCLUDED.technical_feasibility
     END,
     required_resources = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.required_resources, '')) <> '' THEN pms_app.feasibility_studies.required_resources
       ELSE EXCLUDED.required_resources
     END,
     proposed_solution = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.proposed_solution, '')) <> '' THEN pms_app.feasibility_studies.proposed_solution
       ELSE EXCLUDED.proposed_solution
     END,
     major_constraints = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.major_constraints, '')) <> '' THEN pms_app.feasibility_studies.major_constraints
       ELSE EXCLUDED.major_constraints
     END,
     estimated_timeline = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.estimated_timeline, '')) <> '' THEN pms_app.feasibility_studies.estimated_timeline
       ELSE EXCLUDED.estimated_timeline
     END,
     required_equipment = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.required_equipment, '')) <> '' THEN pms_app.feasibility_studies.required_equipment
       ELSE EXCLUDED.required_equipment
     END,
     technical_assumptions = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.technical_assumptions, '')) <> '' THEN pms_app.feasibility_studies.technical_assumptions
       ELSE EXCLUDED.technical_assumptions
     END,
     team_remarks = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.team_remarks, '')) <> '' THEN pms_app.feasibility_studies.team_remarks
       ELSE EXCLUDED.team_remarks
     END,
     commercial_notes = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.commercial_notes, '')) <> '' THEN pms_app.feasibility_studies.commercial_notes
       ELSE EXCLUDED.commercial_notes
     END,
     recommended_next_step = CASE
       WHEN btrim(COALESCE(pms_app.feasibility_studies.recommended_next_step, '')) <> '' THEN pms_app.feasibility_studies.recommended_next_step
       ELSE EXCLUDED.recommended_next_step
     END,
     started_at = COALESCE(pms_app.feasibility_studies.started_at, EXCLUDED.started_at),
     updated_at = NOW()
   WHERE btrim(COALESCE(pms_app.feasibility_studies.proposed_solution, '')) = ''
      OR btrim(COALESCE(pms_app.feasibility_studies.technical_feasibility, '')) = ''
      OR btrim(COALESCE(pms_app.feasibility_studies.technical_assumptions, '')) = ''
      OR pms_app.feasibility_studies.started_at IS NULL
      OR pms_app.feasibility_studies.status = 'NOT_STARTED'`,
  `INSERT INTO pms_app.feasibility_validations (feasibility_id)
   SELECT s.id FROM pms_app.feasibility_studies s
   WHERE NOT EXISTS (
     SELECT 1 FROM pms_app.feasibility_validations v WHERE v.feasibility_id = s.id
   )`,
  `UPDATE pms_app.feasibility_studies s
   SET overall_conclusion = CASE
         WHEN btrim(COALESCE(s.overall_conclusion, '')) <> '' THEN s.overall_conclusion
         ELSE COALESCE(NULLIF(btrim(s.technical_feasibility), ''), NULLIF(btrim(s.proposed_solution), ''), s.overall_conclusion)
       END,
       updated_at = NOW()
   WHERE btrim(COALESCE(s.overall_conclusion, '')) = ''
     AND (
       btrim(COALESCE(s.technical_feasibility, '')) <> ''
       OR btrim(COALESCE(s.proposed_solution, '')) <> ''
     )`,
  `INSERT INTO pms_app.feasibility_team_assignments (
     id, feasibility_id, team_code, team_lead_id, assignment_date, due_date, status, completion_percent, created_at
   )
   SELECT
     pms_app.app_uuid('feas-team', COALESCE(NULLIF(fta.record_key, ''), fta.id::text)),
     s.id,
     CASE lower(regexp_replace(COALESCE(fta.team_id, ''), '^t-', ''))
       WHEN 'vision' THEN 'vision'
       WHEN 'robotics' THEN 'robotics'
       WHEN 'software' THEN 'software'
       WHEN 'procurement' THEN 'procurement'
       WHEN 'execution' THEN 'execution'
       ELSE lower(regexp_replace(COALESCE(fta.team_id, ''), '^t-', ''))
     END,
     CASE
       WHEN btrim(COALESCE(fta.team_lead_id, '')) <> '' THEN pms_app.app_uuid('user', fta.team_lead_id)
       ELSE NULL
     END,
     COALESCE(fta.created_at::date, CURRENT_DATE),
     pms_app.as_date(fta.due_date::text),
     CASE upper(COALESCE(fta.status, ''))
       WHEN 'COMPLETED' THEN 'COMPLETED'
       WHEN 'BLOCKED' THEN 'BLOCKED'
       WHEN 'NOT_STARTED' THEN 'NOT_STARTED'
       ELSE 'IN_PROGRESS'
     END,
     CASE upper(COALESCE(fta.status, '')) WHEN 'COMPLETED' THEN 100 ELSE 40 END,
     COALESCE(fta.created_at, NOW())
   FROM public.feasibility_team_assignments fta
   JOIN public.leads l ON l.record_key = fta.lead_id OR l.id::text = fta.lead_id
   JOIN pms_app.feasibility_studies s
     ON s.lead_id = pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text))
   WHERE CASE lower(regexp_replace(COALESCE(fta.team_id, ''), '^t-', ''))
       WHEN 'vision' THEN true
       WHEN 'robotics' THEN true
       WHEN 'software' THEN true
       WHEN 'procurement' THEN true
       WHEN 'execution' THEN true
       ELSE false
     END
   ON CONFLICT (feasibility_id, team_code) DO UPDATE SET
     team_lead_id = COALESCE(pms_app.feasibility_team_assignments.team_lead_id, EXCLUDED.team_lead_id),
     due_date = COALESCE(pms_app.feasibility_team_assignments.due_date, EXCLUDED.due_date),
     status = CASE
       WHEN pms_app.feasibility_team_assignments.status = 'COMPLETED' THEN pms_app.feasibility_team_assignments.status
       ELSE EXCLUDED.status
     END,
     completion_percent = GREATEST(pms_app.feasibility_team_assignments.completion_percent, EXCLUDED.completion_percent)`,
  `INSERT INTO pms_app.feasibility_assessments (assignment_id, technical_assessment, remarks, updated_at)
   SELECT
     a.id,
     COALESCE(NULLIF(btrim(fta.pm_instructions), ''), ''),
     COALESCE('Legacy assignment: ' || NULLIF(btrim(fta.team_lead_name), ''), ''),
     NOW()
   FROM public.feasibility_team_assignments fta
   JOIN public.leads l ON l.record_key = fta.lead_id OR l.id::text = fta.lead_id
   JOIN pms_app.feasibility_studies s
     ON s.lead_id = pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text))
   JOIN pms_app.feasibility_team_assignments a
     ON a.feasibility_id = s.id
    AND a.team_code = CASE lower(regexp_replace(COALESCE(fta.team_id, ''), '^t-', ''))
      WHEN 'vision' THEN 'vision'
      WHEN 'robotics' THEN 'robotics'
      WHEN 'software' THEN 'software'
      WHEN 'procurement' THEN 'procurement'
      WHEN 'execution' THEN 'execution'
      ELSE lower(regexp_replace(COALESCE(fta.team_id, ''), '^t-', ''))
    END
   WHERE NOT EXISTS (
     SELECT 1 FROM pms_app.feasibility_assessments fa WHERE fa.assignment_id = a.id
   )`,
  `INSERT INTO pms_app.solution_costings (
     id, costing_code, feasibility_id, lead_id, status, currency, created_at, updated_at
   )
   SELECT
     pms_app.app_uuid('costing', COALESCE(NULLIF(l.record_key, ''), l.id::text)),
     'COST-' || lpad(l.id::text, 3, '0'),
     s.id,
     s.lead_id,
     CASE WHEN upper(COALESCE(l.costing_status, '')) = 'APPROVED' THEN 'APPROVED' ELSE 'DRAFT' END,
     CASE WHEN upper(COALESCE(l.currency, '')) IN ('INR', 'USD', 'EUR') THEN upper(l.currency) ELSE 'INR' END,
     COALESCE(l.created_at, NOW()),
     COALESCE(l.updated_at, l.created_at, NOW())
   FROM public.leads l
   JOIN pms_app.feasibility_studies s
     ON s.lead_id = pms_app.app_uuid('lead', COALESCE(NULLIF(l.record_key, ''), l.id::text))
   WHERE btrim(COALESCE(l.costing_status, '')) <> ''
      OR upper(COALESCE(l.status, '')) IN ('NEGOTIATION', 'QUOTATION', 'WON')
   ON CONFLICT (id) DO NOTHING`,
  `INSERT INTO pms_app.solution_costing_versions (
     id, costing_id, version_no, status, is_current, solution_name, solution_description,
     commercial_assumptions, payment_terms, delivery_terms, validity, currency, totals,
     created_at, updated_at
   )
   SELECT
     pms_app.app_uuid('costing-version', COALESCE(NULLIF(l.record_key, ''), l.id::text)),
     c.id,
     1,
     CASE upper(COALESCE(l.costing_status, ''))
       WHEN 'APPROVED' THEN 'APPROVED'
       WHEN 'SUBMITTED' THEN 'SUBMITTED_FOR_APPROVAL'
       WHEN 'DRAFT' THEN 'DRAFT'
       ELSE 'IN_PROGRESS'
     END,
     TRUE,
     COALESCE(NULLIF(l.title, ''), 'Solution'),
     COALESCE(l.fs_proposed_solution, ''),
     COALESCE(l.costing_commercial_assumptions, ''),
     COALESCE(l.quotation_payment_terms, ''),
     COALESCE(l.quotation_delivery_terms, ''),
     COALESCE(l.quotation_validity, ''),
     c.currency,
     jsonb_build_object(
       'totalInternal', COALESCE(l.costing_total_estimated_cost, 0),
       'selling', COALESCE(l.quotation_value, l.costing_total_estimated_cost, 0),
       'components', COALESCE(l.costing_component_costs, 0),
       'procurement', COALESCE(l.costing_procurement_costs, 0),
       'engineering', COALESCE(l.costing_engineering_costs, 0),
       'software', COALESCE(l.costing_software_costs, 0),
       'installation', COALESCE(l.costing_installation_costs, 0),
       'other', COALESCE(l.costing_other_costs, 0)
     ),
     COALESCE(l.created_at, NOW()),
     COALESCE(l.updated_at, l.created_at, NOW())
   FROM public.leads l
   JOIN pms_app.solution_costings c
     ON c.id = pms_app.app_uuid('costing', COALESCE(NULLIF(l.record_key, ''), l.id::text))
   ON CONFLICT (id) DO UPDATE SET
     solution_name = CASE
       WHEN btrim(COALESCE(pms_app.solution_costing_versions.solution_name, '')) <> '' THEN pms_app.solution_costing_versions.solution_name
       ELSE EXCLUDED.solution_name
     END,
     solution_description = CASE
       WHEN btrim(COALESCE(pms_app.solution_costing_versions.solution_description, '')) <> '' THEN pms_app.solution_costing_versions.solution_description
       ELSE EXCLUDED.solution_description
     END,
     commercial_assumptions = CASE
       WHEN btrim(COALESCE(pms_app.solution_costing_versions.commercial_assumptions, '')) <> '' THEN pms_app.solution_costing_versions.commercial_assumptions
       ELSE EXCLUDED.commercial_assumptions
     END,
     payment_terms = CASE
       WHEN btrim(COALESCE(pms_app.solution_costing_versions.payment_terms, '')) <> '' THEN pms_app.solution_costing_versions.payment_terms
       ELSE EXCLUDED.payment_terms
     END,
     delivery_terms = CASE
       WHEN btrim(COALESCE(pms_app.solution_costing_versions.delivery_terms, '')) <> '' THEN pms_app.solution_costing_versions.delivery_terms
       ELSE EXCLUDED.delivery_terms
     END,
     validity = CASE
       WHEN btrim(COALESCE(pms_app.solution_costing_versions.validity, '')) <> '' THEN pms_app.solution_costing_versions.validity
       ELSE EXCLUDED.validity
     END,
     totals = CASE
       WHEN COALESCE((pms_app.solution_costing_versions.totals->>'selling')::numeric, 0) > 0
         OR COALESCE((pms_app.solution_costing_versions.totals->>'totalInternal')::numeric, 0) > 0
       THEN pms_app.solution_costing_versions.totals
       ELSE EXCLUDED.totals
     END,
     updated_at = NOW()
   WHERE btrim(COALESCE(pms_app.solution_costing_versions.solution_description, '')) = ''
      OR btrim(COALESCE(pms_app.solution_costing_versions.solution_name, '')) = ''
      OR (
        COALESCE((pms_app.solution_costing_versions.totals->>'selling')::numeric, 0) = 0
        AND COALESCE((EXCLUDED.totals->>'selling')::numeric, 0) > 0
      )`,
  `INSERT INTO pms_app.solution_costing_teams (version_id, team_code, contribution, estimated_cost, members, status)
   SELECT DISTINCT ON (v.id, orphan.team_code)
     v.id,
     orphan.team_code,
     orphan.contribution,
     orphan.estimated_cost,
     orphan.members,
     orphan.status
   FROM pms_app.solution_costing_versions v
   JOIN pms_app.solution_costings c ON c.id = v.costing_id AND v.is_current = TRUE
   JOIN pms_app.solution_costing_teams orphan
     ON orphan.team_code IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pms_app.solution_costing_versions keep WHERE keep.id = orphan.version_id
    )
   WHERE (SELECT count(*)::int FROM pms_app.solution_costing_versions WHERE is_current = TRUE) = 1
     AND NOT EXISTS (
       SELECT 1 FROM pms_app.solution_costing_teams existing
       WHERE existing.version_id = v.id AND existing.team_code = orphan.team_code
     )
   ORDER BY v.id, orphan.team_code, length(coalesce(orphan.contribution, '')) DESC
   ON CONFLICT (version_id, team_code) DO NOTHING`,
  `INSERT INTO pms_app.solution_cost_entries (version_id, section, line_key, label, mode, hours, rate, amount, sort_order)
   SELECT DISTINCT ON (v.id, orphan.line_key)
     v.id,
     orphan.section,
     orphan.line_key,
     orphan.label,
     orphan.mode,
     orphan.hours,
     orphan.rate,
     orphan.amount,
     orphan.sort_order
   FROM pms_app.solution_costing_versions v
   JOIN pms_app.solution_costings c ON c.id = v.costing_id AND v.is_current = TRUE
   JOIN pms_app.solution_cost_entries orphan
     ON NOT EXISTS (
       SELECT 1 FROM pms_app.solution_costing_versions keep WHERE keep.id = orphan.version_id
     )
   WHERE (SELECT count(*)::int FROM pms_app.solution_costing_versions WHERE is_current = TRUE) = 1
     AND NOT EXISTS (
       SELECT 1 FROM pms_app.solution_cost_entries existing
       WHERE existing.version_id = v.id AND existing.line_key = orphan.line_key
     )
   ORDER BY v.id, orphan.line_key, orphan.sort_order
   ON CONFLICT (version_id, line_key) DO NOTHING`,
  `INSERT INTO pms_app.solution_bom_items (
     version_id, item_no, category, component, description, quantity, unit, unit_cost, remarks, sort_order
   )
   SELECT
     v.id,
     1,
     'Miscellaneous',
     COALESCE(NULLIF(btrim(l.costing_bom_components::text), ''), 'Legacy BOM'),
     'Migrated from legacy costing BOM note',
     1,
     'Lot',
     0,
     'Legacy costing_bom_components',
     0
   FROM public.leads l
   JOIN pms_app.solution_costings c
     ON c.id = pms_app.app_uuid('costing', COALESCE(NULLIF(l.record_key, ''), l.id::text))
   JOIN pms_app.solution_costing_versions v ON v.costing_id = c.id AND v.is_current = TRUE
   WHERE btrim(COALESCE(l.costing_bom_components::text, '')) NOT IN ('', 'null')
     AND NOT EXISTS (
       SELECT 1 FROM pms_app.solution_bom_items b WHERE b.version_id = v.id
     )`,
  `CREATE TABLE IF NOT EXISTS pms_app.message_attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL,
     file_name TEXT NOT NULL DEFAULT '',
     stored_name TEXT NOT NULL DEFAULT '',
     mime_type TEXT NOT NULL DEFAULT '',
     size_bytes INTEGER NOT NULL DEFAULT 0,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.message_reactions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     message_id UUID NOT NULL,
     user_id UUID NOT NULL,
     emoji TEXT NOT NULL,
     UNIQUE (message_id, user_id, emoji)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.message_reads (
     message_id UUID NOT NULL,
     user_id UUID NOT NULL,
     read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (message_id, user_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.message_pins (
     conversation_id UUID NOT NULL,
     message_id UUID NOT NULL,
     pinned_by UUID,
     pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (conversation_id, message_id)
   )`,
  `CREATE TABLE IF NOT EXISTS pms_app.message_activity (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     actor_id UUID,
     action TEXT NOT NULL DEFAULT '',
     conversation_id UUID,
     message_id UUID,
     thread_id UUID,
     comment TEXT NOT NULL DEFAULT '',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE OR REPLACE FUNCTION pms_app.next_public_id(target regclass) RETURNS integer LANGUAGE plpgsql AS $fn$
   DECLARE next_id integer;
   BEGIN
     EXECUTE format('SELECT COALESCE(MAX(id), 0) + 1 FROM %s', target) INTO next_id;
     RETURN next_id;
   END
   $fn$`,
  `CREATE OR REPLACE FUNCTION pms_app.users_insert() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     source_id integer;
     source_key text;
     role_code text;
     manager_key text;
     manager_name text;
   BEGIN
     source_id := pms_app.next_public_id('public.users');
     source_key := 'u-' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);
     role_code := CASE NEW.role_id
       WHEN 1 THEN 'CEO' WHEN 2 THEN 'SYSTEM_ADMIN' WHEN 4 THEN 'PROJECT_MANAGER'
       WHEN 5 THEN 'TEAM_LEAD' ELSE 'EMPLOYEE' END;
     SELECT user_key, name INTO manager_key, manager_name
     FROM public.users
     WHERE NEW.reporting_manager_id IS NOT NULL AND pms_app.app_uuid('user', user_key) = NEW.reporting_manager_id
     LIMIT 1;
     INSERT INTO public.users (
       id, user_key, name, email, phone, role, role_code, status, account_status,
       password_hash, password_created_at, email_verified, employee_id,
       reporting_manager_id, reporting_manager_name, created_at, updated_at
     ) VALUES (
       source_id, source_key, left(COALESCE(NEW.full_name, 'New user'), 200),
       lower(COALESCE(NEW.email, source_key || '@careyu.local')), COALESCE(NEW.phone, ''),
       role_code, role_code,
       CASE WHEN NEW.is_active IS FALSE OR NEW.employment_status = 'INACTIVE' THEN 'INACTIVE' ELSE 'ACTIVE' END,
       CASE WHEN NEW.is_active IS FALSE OR NEW.employment_status = 'INACTIVE' THEN 'DISABLED' ELSE 'ACTIVE' END,
       COALESCE(NEW.password_hash, ''), NOW(), TRUE, COALESCE(NEW.employee_code, ''),
       COALESCE(manager_key, ''), COALESCE(manager_name, ''), NOW(), NOW()
     );
     INSERT INTO pms_app.user_auth_state (user_id, must_change_password)
     VALUES (pms_app.app_uuid('user', source_key), COALESCE(NEW.must_change_password, FALSE))
     ON CONFLICT (user_id) DO NOTHING;
     RETURN (SELECT v FROM pms_app.users v WHERE v.id = pms_app.app_uuid('user', source_key));
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS users_apply_insert ON pms_app.users`,
  `CREATE TRIGGER users_apply_insert INSTEAD OF INSERT ON pms_app.users
   FOR EACH ROW EXECUTE FUNCTION pms_app.users_insert()`,
  `CREATE OR REPLACE FUNCTION pms_app.teams_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     source_id integer;
     source_key text;
     lead_key text;
     lead_name text;
   BEGIN
     IF TG_OP = 'INSERT' THEN
       source_id := pms_app.next_public_id('public.teams');
       source_key := 't-' || substr(md5(clock_timestamp()::text || random()::text), 1, 12);
       SELECT user_key, name INTO lead_key, lead_name FROM public.users
       WHERE NEW.lead_id IS NOT NULL AND pms_app.app_uuid('user', user_key) = NEW.lead_id LIMIT 1;
       INSERT INTO public.teams (id, record_key, code, name, description, team_lead_id, team_lead_name, status, member_count, created_at)
       VALUES (
         source_id, source_key, left(COALESCE(NEW.code, 'TEAM'), 40), left(COALESCE(NEW.name, 'Team'), 160),
         COALESCE(NEW.description, ''), COALESCE(lead_key, ''), COALESCE(lead_name, ''),
         CASE WHEN upper(COALESCE(NEW.status, 'ACTIVE')) = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END,
         0, NOW()
       );
       INSERT INTO pms_app.team_profile (team_id, department, assignment_rule, category)
       VALUES (
         pms_app.app_uuid('team', source_key), COALESCE(NEW.department, ''),
         COALESCE(NULLIF(NEW.assignment_rule, ''), 'TEAM_LEAD_ONLY'), COALESCE(NEW.category, '')
       )
       ON CONFLICT (team_id) DO UPDATE SET department = EXCLUDED.department, assignment_rule = EXCLUDED.assignment_rule, category = EXCLUDED.category;
       RETURN (SELECT v FROM pms_app.teams v WHERE v.id = pms_app.app_uuid('team', source_key));
     ELSIF TG_OP = 'UPDATE' THEN
       SELECT user_key, name INTO lead_key, lead_name FROM public.users
       WHERE NEW.lead_id IS NOT NULL AND pms_app.app_uuid('user', user_key) = NEW.lead_id LIMIT 1;
       UPDATE public.teams SET
         code = left(COALESCE(NEW.code, code), 40),
         name = left(COALESCE(NEW.name, name), 160),
         description = COALESCE(NEW.description, ''),
         status = CASE WHEN upper(COALESCE(NEW.status, 'ACTIVE')) = 'ACTIVE' THEN 'ACTIVE' ELSE 'INACTIVE' END,
         team_lead_id = CASE WHEN NEW.lead_id IS NULL THEN '' ELSE COALESCE(lead_key, team_lead_id) END,
         team_lead_name = CASE WHEN NEW.lead_id IS NULL THEN '' ELSE COALESCE(lead_name, team_lead_name) END
       WHERE pms_app.app_uuid('team', record_key) = OLD.id;
       INSERT INTO pms_app.team_profile (team_id, department, assignment_rule, category)
       VALUES (OLD.id, COALESCE(NEW.department, ''), COALESCE(NULLIF(NEW.assignment_rule, ''), 'TEAM_LEAD_ONLY'), COALESCE(NEW.category, ''))
       ON CONFLICT (team_id) DO UPDATE SET department = EXCLUDED.department, assignment_rule = EXCLUDED.assignment_rule, category = EXCLUDED.category;
       RETURN (SELECT v FROM pms_app.teams v WHERE v.id = OLD.id);
     END IF;
     DELETE FROM pms_app.team_profile WHERE team_id = OLD.id;
     DELETE FROM public.teams WHERE pms_app.app_uuid('team', record_key) = OLD.id;
     RETURN OLD;
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS teams_write ON pms_app.teams`,
  `CREATE TRIGGER teams_write INSTEAD OF INSERT OR UPDATE OR DELETE ON pms_app.teams
   FOR EACH ROW EXECUTE FUNCTION pms_app.teams_write()`,
  `CREATE OR REPLACE FUNCTION pms_app.team_members_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     team_key text;
     team_label text;
     person uuid;
     updated_count integer;
   BEGIN
     person := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
     IF TG_OP <> 'DELETE' THEN
       SELECT record_key, name INTO team_key, team_label FROM public.teams
       WHERE pms_app.app_uuid('team', record_key) = NEW.team_id LIMIT 1;
       IF team_key IS NULL THEN
         RAISE EXCEPTION 'Team not found' USING ERRCODE = '23503';
       END IF;
       IF upper(COALESCE(NEW.status, 'ACTIVE')) = 'INACTIVE' THEN
         UPDATE public.users SET team_id = '', team_name = '', updated_at = NOW()
         WHERE pms_app.app_uuid('user', user_key) = person
           AND pms_app.app_uuid('team', team_id) = NEW.team_id;
       ELSE
         UPDATE public.users SET
           team_id = team_key,
           team_name = team_label,
           role_code = CASE WHEN NEW.role = 'TEAM_LEAD' THEN 'TEAM_LEAD' ELSE role_code END,
           role = CASE WHEN NEW.role = 'TEAM_LEAD' THEN 'TEAM_LEAD' ELSE role END,
           updated_at = NOW()
         WHERE pms_app.app_uuid('user', user_key) = person;
         GET DIAGNOSTICS updated_count = ROW_COUNT;
         IF updated_count = 0 THEN
           RAISE EXCEPTION 'User not found' USING ERRCODE = '23503';
         END IF;
         IF NEW.role = 'TEAM_LEAD' THEN
           UPDATE public.teams SET team_lead_id = u.user_key, team_lead_name = u.name
           FROM public.users u
           WHERE public.teams.record_key = team_key AND pms_app.app_uuid('user', u.user_key) = person;
         END IF;
       END IF;
       RETURN (SELECT v FROM pms_app.team_members v WHERE v.team_id = NEW.team_id AND v.user_id = person LIMIT 1);
     END IF;
     UPDATE public.users SET team_id = '', team_name = '', updated_at = NOW()
     WHERE pms_app.app_uuid('user', user_key) = OLD.user_id
       AND pms_app.app_uuid('team', team_id) = OLD.team_id;
     UPDATE public.teams SET team_lead_id = '', team_lead_name = ''
     WHERE pms_app.app_uuid('team', record_key) = OLD.team_id
       AND pms_app.app_uuid('user', team_lead_id) = OLD.user_id;
     RETURN OLD;
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS team_members_write ON pms_app.team_members`,
  `CREATE TRIGGER team_members_write INSTEAD OF INSERT OR UPDATE OR DELETE ON pms_app.team_members
   FOR EACH ROW EXECUTE FUNCTION pms_app.team_members_write()`,
  `CREATE OR REPLACE FUNCTION pms_app.conversations_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     source_id integer;
     source_key text;
     owner_key text;
     owner_name text;
   BEGIN
     IF TG_OP = 'INSERT' THEN
       source_id := pms_app.next_public_id('public.conversations');
       source_key := 'c-' || substr(md5(clock_timestamp()::text || random()::text), 1, 12);
       SELECT user_key, name INTO owner_key, owner_name FROM public.users
       WHERE NEW.created_by IS NOT NULL AND pms_app.app_uuid('user', user_key) = NEW.created_by LIMIT 1;
       INSERT INTO public.conversations (id, record_key, type, name, description, created_by_id, created_by, created_at, updated_at)
       VALUES (
         source_id, source_key, COALESCE(NEW.type, 'GROUP'), COALESCE(NEW.name, ''), COALESCE(NEW.description, ''),
         COALESCE(owner_key, ''), COALESCE(owner_name, ''), NOW(), NOW()
       );
       RETURN (SELECT v FROM pms_app.conversations v WHERE v.id = pms_app.app_uuid('conversation', source_key));
     END IF;
     UPDATE public.conversations SET
       name = COALESCE(NEW.name, name),
       description = COALESCE(NEW.description, description),
       updated_at = COALESCE(NEW.updated_at, NOW()),
       deleted_at = CASE WHEN TG_OP = 'DELETE' THEN NOW() ELSE deleted_at END
     WHERE pms_app.app_uuid('conversation', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.id;
     IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
     RETURN NEW;
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS conversations_write ON pms_app.conversations`,
  `CREATE TRIGGER conversations_write INSTEAD OF INSERT OR UPDATE OR DELETE ON pms_app.conversations
   FOR EACH ROW EXECUTE FUNCTION pms_app.conversations_write()`,
  `CREATE OR REPLACE FUNCTION pms_app.conversation_members_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     conv_key text;
     person_key text;
     source_id integer;
     source_key text;
   BEGIN
     IF TG_OP = 'UPDATE' THEN
       UPDATE public.conversation_participants p SET last_read_at = NEW.last_read_at
       WHERE pms_app.app_uuid('participant', COALESCE(NULLIF(p.record_key, ''), p.id::text)) = OLD.id;
       RETURN NEW;
     END IF;
     SELECT COALESCE(NULLIF(record_key, ''), id::text) INTO conv_key FROM public.conversations
     WHERE pms_app.app_uuid('conversation', COALESCE(NULLIF(record_key, ''), id::text)) = NEW.conversation_id LIMIT 1;
     SELECT user_key INTO person_key FROM public.users WHERE pms_app.app_uuid('user', user_key) = NEW.user_id LIMIT 1;
     IF conv_key IS NULL OR person_key IS NULL THEN
       RAISE EXCEPTION 'Conversation member could not be saved' USING ERRCODE = '23503';
     END IF;
     source_id := pms_app.next_public_id('public.conversation_participants');
     source_key := 'p-' || substr(md5(clock_timestamp()::text || random()::text), 1, 12);
     INSERT INTO public.conversation_participants (id, record_key, conversation_id, user_id, role, joined_at, last_read_at)
     VALUES (source_id, source_key, conv_key, person_key, COALESCE(NEW.role, 'MEMBER'), NOW(), NEW.last_read_at);
     RETURN (SELECT v FROM pms_app.conversation_members v WHERE v.conversation_id = NEW.conversation_id AND v.user_id = NEW.user_id LIMIT 1);
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS conversation_members_write ON pms_app.conversation_members`,
  `CREATE TRIGGER conversation_members_write INSTEAD OF INSERT OR UPDATE ON pms_app.conversation_members
   FOR EACH ROW EXECUTE FUNCTION pms_app.conversation_members_write()`,
  `CREATE OR REPLACE FUNCTION pms_app.messages_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     source_id integer;
     source_key text;
     conv_key text;
     sender_key text;
     sender_name text;
   BEGIN
     IF TG_OP = 'INSERT' THEN
       source_id := pms_app.next_public_id('public.chat_messages');
       source_key := 'm-' || substr(md5(clock_timestamp()::text || random()::text), 1, 12);
       SELECT COALESCE(NULLIF(record_key, ''), id::text) INTO conv_key FROM public.conversations
       WHERE pms_app.app_uuid('conversation', COALESCE(NULLIF(record_key, ''), id::text)) = NEW.conversation_id LIMIT 1;
       SELECT user_key, name INTO sender_key, sender_name FROM public.users
       WHERE pms_app.app_uuid('user', user_key) = NEW.sender_id LIMIT 1;
       IF conv_key IS NULL OR sender_key IS NULL THEN
         RAISE EXCEPTION 'Message could not be saved' USING ERRCODE = '23503';
       END IF;
       INSERT INTO public.chat_messages (
         id, record_key, conversation_id, sender_id, sender_name, message, message_type, created_at, updated_at
       ) VALUES (
         source_id, source_key, conv_key, sender_key, COALESCE(sender_name, ''), COALESCE(NEW.body, ''), 'TEXT', NOW(), NOW()
       );
       RETURN (SELECT v FROM pms_app.messages v WHERE v.id = pms_app.app_uuid('chat', source_key));
     END IF;
     UPDATE public.chat_messages SET
       message = COALESCE(NEW.body, ''),
       deleted_at = NEW.deleted_at,
       updated_at = NOW()
     WHERE pms_app.app_uuid('chat', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.id;
     RETURN NEW;
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS messages_write ON pms_app.messages`,
  `CREATE TRIGGER messages_write INSTEAD OF INSERT OR UPDATE ON pms_app.messages
   FOR EACH ROW EXECUTE FUNCTION pms_app.messages_write()`,
  `CREATE OR REPLACE FUNCTION pms_app.forum_threads_write() RETURNS trigger LANGUAGE plpgsql AS $fn$
   DECLARE
     source_id integer;
     source_key text;
     author_key text;
     author_name text;
   BEGIN
     IF TG_OP = 'INSERT' THEN
       source_id := pms_app.next_public_id('public.forum_posts');
       source_key := 'f-' || substr(md5(clock_timestamp()::text || random()::text), 1, 12);
       SELECT user_key, name INTO author_key, author_name FROM public.users
       WHERE NEW.author_id IS NOT NULL AND pms_app.app_uuid('user', user_key) = NEW.author_id LIMIT 1;
       INSERT INTO public.forum_posts (
         id, record_key, title, body, body_text, category, author_id, author_name, locked, created_at, updated_at
       ) VALUES (
         source_id, source_key, left(COALESCE(NEW.title, 'Discussion'), 200), COALESCE(NEW.body, ''),
         left(COALESCE(NEW.body, ''), 4000), COALESCE(NEW.category, 'DISCUSSION'),
         COALESCE(author_key, ''), COALESCE(author_name, ''),
         upper(COALESCE(NEW.status, 'OPEN')) IN ('CLOSED', 'LOCKED'), NOW(), NOW()
       );
       RETURN (SELECT v FROM pms_app.forum_threads v WHERE v.id = pms_app.app_uuid('forum', source_key));
     END IF;
     UPDATE public.forum_posts SET
       title = left(COALESCE(NEW.title, title), 200),
       body = COALESCE(NEW.body, body),
       body_text = left(COALESCE(NEW.body, body), 4000),
       locked = upper(COALESCE(NEW.status, 'OPEN')) IN ('CLOSED', 'LOCKED'),
       deleted_at = CASE WHEN TG_OP = 'DELETE' THEN NOW() ELSE deleted_at END,
       updated_at = COALESCE(NEW.last_activity_at, NOW())
     WHERE pms_app.app_uuid('forum', COALESCE(NULLIF(record_key, ''), id::text)) = OLD.id;
     IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
     RETURN NEW;
   END
   $fn$`,
  `DROP TRIGGER IF EXISTS forum_threads_write ON pms_app.forum_threads`,
  `CREATE TRIGGER forum_threads_write INSTEAD OF INSERT OR UPDATE OR DELETE ON pms_app.forum_threads
   FOR EACH ROW EXECUTE FUNCTION pms_app.forum_threads_write()`,
  `CREATE SEQUENCE IF NOT EXISTS pms_app.order_code_seq START 1`,
  `CREATE TABLE IF NOT EXISTS pms_app.project_orders (
     project_id UUID PRIMARY KEY,
     order_code VARCHAR(40) NOT NULL,
     order_date DATE,
     payment_status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_PAYMENT',
     payment_confirmed_at TIMESTAMPTZ,
     payment_confirmed_by UUID,
     payment_reference TEXT NOT NULL DEFAULT '',
     payment_notes TEXT NOT NULL DEFAULT '',
     activated_at TIMESTAMPTZ,
     activated_by UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS project_orders_code_uidx ON pms_app.project_orders (order_code)`,
  `CREATE INDEX IF NOT EXISTS project_orders_activated_idx ON pms_app.project_orders (activated_at)`,
];

async function install(connectionString) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await client.connect();
  try {
    const shape = await client.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'`,
    );
    if (shape.rows[0]?.data_type === 'uuid') return;
    for (let index = 0; index < STATEMENTS.length; index += 1) {
      try {
        await client.query(STATEMENTS[index]);
      } catch (error) {
        const preview = STATEMENTS[index].replace(/\s+/g, ' ').slice(0, 180);
        error.message = `Compatibility statement ${index} failed (${preview}): ${error.message}`;
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

module.exports = { install };
