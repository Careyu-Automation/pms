-- CareYu Automation project workspace
-- PostgreSQL 14+
-- Initial foundation: roles and users only.
-- Future module tables are added in later phases.

CREATE TABLE IF NOT EXISTS roles (
  id SMALLSERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  department VARCHAR(100),
  designation VARCHAR(100),
  role_id SMALLINT NOT NULL REFERENCES roles (id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT users_full_name_length CHECK (char_length(btrim(full_name)) >= 2),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS users_role_id_idx ON users (role_id);
CREATE INDEX IF NOT EXISTS users_is_active_idx ON users (is_active);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_set_updated_at ON roles;
CREATE TRIGGER roles_set_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE SEQUENCE IF NOT EXISTS lead_code_seq START 1;

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL DEFAULT '',
  customer_name VARCHAR(200) NOT NULL DEFAULT '',
  customer_type VARCHAR(80) NOT NULL DEFAULT '',
  business_vertical VARCHAR(120) NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users (id),
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  expected_decision_date DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  stage VARCHAR(40) NOT NULL DEFAULT 'Draft',
  contact_person VARCHAR(150) NOT NULL DEFAULT '',
  designation VARCHAR(150) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(40) NOT NULL DEFAULT '',
  office_location TEXT NOT NULL DEFAULT '',
  site_location TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  customer_requirement TEXT NOT NULL DEFAULT '',
  use_case TEXT NOT NULL DEFAULT '',
  production_quantity TEXT NOT NULL DEFAULT '',
  estimated_value TEXT NOT NULL DEFAULT '',
  required_solution TEXT NOT NULL DEFAULT '',
  technical_requirements TEXT NOT NULL DEFAULT '',
  commercial_requirements TEXT NOT NULL DEFAULT '',
  competitor_info TEXT NOT NULL DEFAULT '',
  customer_challenge TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  visit_requirement VARCHAR(40) NOT NULL DEFAULT 'No Visit Required',
  submitted_to_pm_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES users (id),
  pm_reviewed_at TIMESTAMPTZ,
  pm_reviewed_by UUID REFERENCES users (id),
  pm_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leads_status_check CHECK (status IN ('DRAFT', 'SUBMITTED_TO_PM', 'CHANGES_REQUESTED', 'PM_APPROVED', 'ON_HOLD')),
  CONSTRAINT leads_priority_check CHECK (priority IN ('Low', 'Medium', 'High'))
);

CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_created_by_idx ON leads (created_by);

DROP TRIGGER IF EXISTS leads_set_updated_at ON leads;
CREATE TRIGGER leads_set_updated_at
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS lead_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_documents_lead_id_idx ON lead_documents (lead_id);

CREATE TABLE IF NOT EXISTS lead_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id),
  action VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lead_activity_lead_id_idx ON lead_activity (lead_id, created_at);

-- Feasibility studies hang off an approved lead. Lead, user, and team identity
-- stay in their existing tables; these tables store only the study workflow.

CREATE TABLE IF NOT EXISTS feasibility_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL UNIQUE REFERENCES leads (id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
  owner_id UUID REFERENCES users (id) ON DELETE SET NULL,
  started_by UUID REFERENCES users (id) ON DELETE SET NULL,
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
  prepared_by UUID REFERENCES users (id) ON DELETE SET NULL,
  prepared_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES users (id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  review_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feasibility_status_check CHECK (status IN (
    'NOT_STARTED', 'IN_PROGRESS', 'PENDING_TEAM_INPUT', 'UNDER_REVIEW',
    'FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'MORE_INFORMATION_REQUIRED'
  )),
  CONSTRAINT feasibility_decision_check CHECK (decision IN (
    '', 'FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'MORE_INFORMATION_REQUIRED'
  ))
);

CREATE INDEX IF NOT EXISTS feasibility_studies_status_idx ON feasibility_studies (status);
CREATE INDEX IF NOT EXISTS feasibility_studies_owner_idx ON feasibility_studies (owner_id);

DROP TRIGGER IF EXISTS feasibility_studies_set_updated_at ON feasibility_studies;
CREATE TRIGGER feasibility_studies_set_updated_at
BEFORE UPDATE ON feasibility_studies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS feasibility_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL UNIQUE REFERENCES feasibility_studies (id) ON DELETE CASCADE,
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
  tests JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT feasibility_test_status_check CHECK (test_status IN (
    'NOT_REQUIRED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'
  )),
  CONSTRAINT feasibility_sample_status_check CHECK (sample_status IN (
    'NOT_RECEIVED', 'REQUESTED', 'RECEIVED', 'INSPECTED', 'RETURNED'
  ))
);

ALTER TABLE feasibility_validations ADD COLUMN IF NOT EXISTS tests JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS feasibility_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  team_code VARCHAR(40) NOT NULL,
  team_lead_id UUID REFERENCES users (id) ON DELETE SET NULL,
  assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',
  completion_percent SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feasibility_team_code_check CHECK (team_code IN (
    'software', 'robotics', 'procurement', 'execution', 'vision'
  )),
  CONSTRAINT feasibility_team_status_check CHECK (status IN (
    'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'
  )),
  CONSTRAINT feasibility_team_completion_check CHECK (completion_percent BETWEEN 0 AND 100),
  UNIQUE (feasibility_id, team_code)
);

CREATE INDEX IF NOT EXISTS feasibility_team_assignments_study_idx ON feasibility_team_assignments (feasibility_id);

CREATE TABLE IF NOT EXISTS feasibility_team_members (
  assignment_id UUID NOT NULL REFERENCES feasibility_team_assignments (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, user_id)
);

CREATE TABLE IF NOT EXISTS feasibility_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL UNIQUE REFERENCES feasibility_team_assignments (id) ON DELETE CASCADE,
  technical_assessment TEXT NOT NULL DEFAULT '',
  required_resources TEXT NOT NULL DEFAULT '',
  proposed_approach TEXT NOT NULL DEFAULT '',
  constraints TEXT NOT NULL DEFAULT '',
  required_components TEXT NOT NULL DEFAULT '',
  technical_assumptions TEXT NOT NULL DEFAULT '',
  risks TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  specialty JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feasibility_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  parameter VARCHAR(160) NOT NULL DEFAULT '',
  customer_requirement TEXT NOT NULL DEFAULT '',
  proposed TEXT NOT NULL DEFAULT '',
  unit VARCHAR(40) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_VALIDATION',
  remarks TEXT NOT NULL DEFAULT '',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT feasibility_requirement_status_check CHECK (status IN (
    'FEASIBLE', 'CONDITIONAL', 'NOT_FEASIBLE', 'PENDING_VALIDATION'
  ))
);

CREATE INDEX IF NOT EXISTS feasibility_requirements_study_idx ON feasibility_requirements (feasibility_id, sort_order);

CREATE TABLE IF NOT EXISTS feasibility_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  risk TEXT NOT NULL DEFAULT '',
  category VARCHAR(80) NOT NULL DEFAULT '',
  impact VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  probability VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  mitigation TEXT NOT NULL DEFAULT '',
  owner_id UUID REFERENCES users (id) ON DELETE SET NULL,
  target_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  sort_order SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT feasibility_risk_level_check CHECK (impact IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT feasibility_risk_probability_check CHECK (probability IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT feasibility_risk_band_check CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT feasibility_risk_status_check CHECK (status IN ('OPEN', 'MITIGATING', 'MITIGATED', 'ACCEPTED'))
);

CREATE INDEX IF NOT EXISTS feasibility_risks_study_idx ON feasibility_risks (feasibility_id);

CREATE TABLE IF NOT EXISTS feasibility_customer_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  information_required TEXT NOT NULL DEFAULT '',
  requested_from VARCHAR(150) NOT NULL DEFAULT '',
  requested_date DATE,
  expected_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  remarks TEXT NOT NULL DEFAULT '',
  critical BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT feasibility_input_status_check CHECK (status IN ('PENDING', 'RECEIVED', 'NOT_REQUIRED'))
);

CREATE INDEX IF NOT EXISTS feasibility_customer_inputs_study_idx ON feasibility_customer_inputs (feasibility_id);

CREATE TABLE IF NOT EXISTS feasibility_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES feasibility_team_assignments (id) ON DELETE SET NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  document_type VARCHAR(40) NOT NULL DEFAULT 'Other',
  uploaded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feasibility_documents_study_idx ON feasibility_documents (feasibility_id);

CREATE TABLE IF NOT EXISTS feasibility_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  occurred_on DATE,
  communication_type VARCHAR(40) NOT NULL DEFAULT 'Email',
  person VARCHAR(150) NOT NULL DEFAULT '',
  subject VARCHAR(200) NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  action_required TEXT NOT NULL DEFAULT '',
  next_follow_up DATE,
  remarks TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feasibility_communication_type_check CHECK (communication_type IN (
    'Email', 'Call', 'Meeting', 'Site Visit', 'Teams Meeting', 'Other'
  ))
);

CREATE INDEX IF NOT EXISTS feasibility_communications_study_idx ON feasibility_communications (feasibility_id, created_at);

CREATE TABLE IF NOT EXISTS feasibility_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feasibility_activity_study_idx ON feasibility_activity (feasibility_id, created_at);

CREATE TABLE IF NOT EXISTS solution_costings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feasibility_id UUID NOT NULL UNIQUE REFERENCES feasibility_studies (id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS solution_costings_lead_idx ON solution_costings (lead_id);

DROP TRIGGER IF EXISTS solution_costings_set_updated_at ON solution_costings;
CREATE TRIGGER solution_costings_set_updated_at
BEFORE UPDATE ON solution_costings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Costing hangs off an approved feasibility. Versions keep earlier prices unchanged.

CREATE SEQUENCE IF NOT EXISTS costing_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS project_code_seq START 1;

ALTER TABLE solution_costings ADD COLUMN IF NOT EXISTS costing_code VARCHAR(20);
ALTER TABLE solution_costings ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE solution_costings ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'INR';

CREATE UNIQUE INDEX IF NOT EXISTS solution_costings_code_idx ON solution_costings (costing_code) WHERE costing_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS solution_costing_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  costing_id UUID NOT NULL REFERENCES solution_costings (id) ON DELETE CASCADE,
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
  submitted_by UUID REFERENCES users (id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT solution_costing_version_unique UNIQUE (costing_id, version_no),
  CONSTRAINT solution_costing_version_status_check CHECK (status IN (
    'DRAFT', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'CHANGES_REQUESTED',
    'SUBMITTED_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED'
  )),
  CONSTRAINT solution_costing_overhead_base_check CHECK (overhead_base IN ('DIRECT', 'SUBTOTAL')),
  CONSTRAINT solution_costing_currency_check CHECK (currency IN ('INR', 'USD', 'EUR'))
);

CREATE INDEX IF NOT EXISTS solution_costing_versions_current_idx ON solution_costing_versions (costing_id, is_current);

DROP TRIGGER IF EXISTS solution_costing_versions_set_updated_at ON solution_costing_versions;
CREATE TRIGGER solution_costing_versions_set_updated_at
BEFORE UPDATE ON solution_costing_versions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS solution_costing_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL DEFAULT 'Other',
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS solution_bom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
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
  sort_order SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT solution_bom_purchase_status_check CHECK (purchase_status IN (
    'NOT_REQUESTED', 'RFQ_SENT', 'QUOTE_RECEIVED', 'UNDER_REVIEW', 'ORDERED', 'RECEIVED'
  ))
);

CREATE INDEX IF NOT EXISTS solution_bom_items_version_idx ON solution_bom_items (version_id, sort_order);

CREATE TABLE IF NOT EXISTS solution_cost_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
  section VARCHAR(40) NOT NULL,
  line_key VARCHAR(60) NOT NULL,
  label VARCHAR(120) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'AMOUNT',
  hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  rate NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT solution_cost_entry_mode_check CHECK (mode IN ('HOURS', 'AMOUNT')),
  UNIQUE (version_id, line_key)
);

CREATE TABLE IF NOT EXISTS solution_costing_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
  risk TEXT NOT NULL DEFAULT '',
  impact VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  probability VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  mitigation TEXT NOT NULL DEFAULT '',
  cost_impact NUMERIC(14, 2) NOT NULL DEFAULT 0,
  owner_id UUID REFERENCES users (id) ON DELETE SET NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS solution_costing_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
  team_code VARCHAR(40) NOT NULL,
  contribution TEXT NOT NULL DEFAULT '',
  estimated_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  members TEXT NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
  UNIQUE (version_id, team_code)
);

CREATE TABLE IF NOT EXISTS solution_costing_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL DEFAULT '',
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  document_type VARCHAR(40) NOT NULL DEFAULT 'Other',
  uploaded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  source_feasibility_id UUID,
  source_document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solution_costing_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES solution_costing_versions (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  decision VARCHAR(40) NOT NULL,
  comments TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solution_costing_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  costing_id UUID NOT NULL REFERENCES solution_costings (id) ON DELETE CASCADE,
  version_id UUID REFERENCES solution_costing_versions (id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solution_costing_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  costing_id UUID NOT NULL REFERENCES solution_costings (id) ON DELETE CASCADE,
  version_id UUID REFERENCES solution_costing_versions (id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  field_name VARCHAR(120) NOT NULL,
  previous_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL DEFAULT '',
  customer_name VARCHAR(200) NOT NULL DEFAULT '',
  lead_id UUID REFERENCES leads (id) ON DELETE SET NULL,
  feasibility_id UUID REFERENCES feasibility_studies (id) ON DELETE SET NULL,
  costing_id UUID REFERENCES solution_costings (id) ON DELETE SET NULL,
  costing_version_id UUID REFERENCES solution_costing_versions (id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  project_manager_id UUID REFERENCES users (id) ON DELETE SET NULL,
  start_date DATE,
  target_date DATE,
  completion_date DATE,
  description TEXT NOT NULL DEFAULT '',
  site_location TEXT NOT NULL DEFAULT '',
  customer_contact TEXT NOT NULL DEFAULT '',
  hold_reason TEXT NOT NULL DEFAULT '',
  risk_reason TEXT NOT NULL DEFAULT '',
  completion_remarks TEXT NOT NULL DEFAULT '',
  approved_value NUMERIC(14, 2),
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS projects_set_updated_at ON projects;
CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_manager_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_location TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_contact TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS hold_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS risk_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_remarks TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approved_value NUMERIC(14, 2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'NOT_STARTED';
UPDATE projects SET status = 'NOT_STARTED' WHERE status = 'AWARDED';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN (
  'NOT_STARTED', 'PLANNING', 'IN_PROGRESS', 'AT_RISK', 'ON_HOLD', 'COMPLETED', 'CANCELLED'
));
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_priority_check;
ALTER TABLE projects ADD CONSTRAINT projects_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

CREATE SEQUENCE IF NOT EXISTS task_code_seq START 1;

CREATE TABLE IF NOT EXISTS project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  start_date DATE,
  end_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_phases_project_idx ON project_phases (project_id, sort_order);

CREATE TABLE IF NOT EXISTS project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases (id) ON DELETE SET NULL,
  task_code VARCHAR(20) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  assignee_id UUID REFERENCES users (id) ON DELETE SET NULL,
  team_code VARCHAR(40) NOT NULL DEFAULT '',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(40) NOT NULL DEFAULT 'NOT_STARTED',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  baseline_start DATE,
  baseline_end DATE,
  estimated_hours NUMERIC(8, 2),
  progress SMALLINT NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_tasks_status_check CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'ON_HOLD', 'CANCELLED', 'BLOCKED')),
  CONSTRAINT project_tasks_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT project_tasks_progress_check CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT project_tasks_dates_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS project_tasks_project_idx ON project_tasks (project_id, sort_order);
CREATE INDEX IF NOT EXISTS project_tasks_assignee_idx ON project_tasks (assignee_id);

CREATE TABLE IF NOT EXISTS task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  predecessor_id UUID NOT NULL REFERENCES project_tasks (id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES project_tasks (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT task_dependencies_distinct CHECK (predecessor_id <> successor_id),
  CONSTRAINT task_dependencies_unique UNIQUE (predecessor_id, successor_id)
);

CREATE INDEX IF NOT EXISTS task_dependencies_project_idx ON task_dependencies (project_id);

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  milestone_date DATE NOT NULL,
  owner_id UUID REFERENCES users (id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_milestones_status_check CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED'))
);

CREATE INDEX IF NOT EXISTS project_milestones_project_idx ON project_milestones (project_id, milestone_date);

CREATE TABLE IF NOT EXISTS project_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  planned_start DATE,
  planned_end DATE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(160) NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS department VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_code VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS project_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  task_id UUID REFERENCES project_tasks (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  hours NUMERIC(8, 2) NOT NULL,
  work_date DATE NOT NULL,
  billable BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_time_entries_hours_check CHECK (hours > 0 AND hours <= 24)
);

CREATE INDEX IF NOT EXISTS project_time_entries_project_idx ON project_time_entries (project_id, work_date);

CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  original_name VARCHAR(240) NOT NULL,
  stored_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_documents_project_idx ON project_documents (project_id, created_at);

CREATE SEQUENCE IF NOT EXISTS product_code_seq START 1;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  team_code VARCHAR(40) NOT NULL,
  department VARCHAR(100) NOT NULL DEFAULT '',
  lead_id UUID REFERENCES leads (id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PLANNING',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  start_date DATE NOT NULL,
  end_date DATE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_status_check CHECK (status IN ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED')),
  CONSTRAINT products_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT products_dates_check CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT products_name_check CHECK (char_length(btrim(name)) >= 2)
);

CREATE INDEX IF NOT EXISTS products_lead_idx ON products (lead_id);
CREATE INDEX IF NOT EXISTS products_team_idx ON products (team_code);

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products (id) ON DELETE CASCADE;
ALTER TABLE project_tasks ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_owner_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_owner_check CHECK (
  (project_id IS NOT NULL AND product_id IS NULL)
  OR (project_id IS NULL AND product_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS project_tasks_product_idx ON project_tasks (product_id);

ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products (id) ON DELETE CASCADE;
ALTER TABLE project_milestones ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE project_milestones DROP CONSTRAINT IF EXISTS project_milestones_owner_check;
ALTER TABLE project_milestones ADD CONSTRAINT project_milestones_owner_check CHECK (
  (project_id IS NOT NULL AND product_id IS NULL)
  OR (project_id IS NULL AND product_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS project_milestones_product_idx ON project_milestones (product_id);

ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products (id) ON DELETE CASCADE;
ALTER TABLE project_activity ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE project_activity DROP CONSTRAINT IF EXISTS project_activity_owner_check;
ALTER TABLE project_activity ADD CONSTRAINT project_activity_owner_check CHECK (
  (project_id IS NOT NULL AND product_id IS NULL)
  OR (project_id IS NULL AND product_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS project_activity_product_idx ON project_activity (product_id, created_at);

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  department VARCHAR(100) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  lead_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT teams_code_unique UNIQUE (code),
  CONSTRAINT teams_code_check CHECK (char_length(btrim(code)) >= 2),
  CONSTRAINT teams_name_check CHECK (char_length(btrim(name)) >= 2),
  CONSTRAINT teams_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS teams_status_idx ON teams (status);
CREATE INDEX IF NOT EXISTS teams_lead_idx ON teams (lead_id);

DROP TRIGGER IF EXISTS teams_set_updated_at ON teams;
CREATE TRIGGER teams_set_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role VARCHAR(30) NOT NULL DEFAULT 'MEMBER',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_members_unique UNIQUE (team_id, user_id),
  CONSTRAINT team_members_role_check CHECK (role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER', 'OVERSIGHT', 'PROJECT_COORDINATION')),
  CONSTRAINT team_members_status_check CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS team_members_team_idx ON team_members (team_id, status);
CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members (user_id);

DROP TRIGGER IF EXISTS team_members_set_updated_at ON team_members;
CREATE TRIGGER team_members_set_updated_at
BEFORE UPDATE ON team_members
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS project_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  team_role VARCHAR(20) NOT NULL DEFAULT 'SUPPORTING',
  contribution_percent SMALLINT NOT NULL DEFAULT 0,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_teams_unique UNIQUE (project_id, team_id),
  CONSTRAINT project_teams_role_check CHECK (team_role IN ('PRIMARY', 'MAJOR', 'SUPPORTING', 'MINOR')),
  CONSTRAINT project_teams_contribution_check CHECK (contribution_percent BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS project_teams_team_idx ON project_teams (team_id);
CREATE INDEX IF NOT EXISTS project_teams_project_idx ON project_teams (project_id);

DROP TRIGGER IF EXISTS project_teams_set_updated_at ON project_teams;
CREATE TRIGGER project_teams_set_updated_at
BEFORE UPDATE ON project_teams
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS team_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(200) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS team_activity_team_idx ON team_activity (team_id, created_at DESC);

INSERT INTO teams (code, name, department, status)
VALUES
  ('software', 'Software Team', 'Software', 'ACTIVE'),
  ('robotics', 'Robotics & Solutions Team', 'Robotics', 'ACTIVE'),
  ('procurement', 'Procurement / Costing Team', 'Procurement', 'ACTIVE'),
  ('execution', 'Execution Team', 'Execution', 'ACTIVE'),
  ('vision', 'Vision Team', 'Vision', 'ACTIVE')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  visit_date DATE,
  visibility VARCHAR(20) NOT NULL DEFAULT 'EVERYONE',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checklists_title_check CHECK (char_length(btrim(title)) >= 1),
  CONSTRAINT checklists_visibility_check CHECK (visibility IN ('EVERYONE', 'PRIVATE', 'SELECTED_USERS'))
);

CREATE INDEX IF NOT EXISTS checklists_employee_idx ON checklists (employee_id);
CREATE INDEX IF NOT EXISTS checklists_created_idx ON checklists (created_at DESC);
CREATE INDEX IF NOT EXISTS checklists_visibility_idx ON checklists (visibility);

DROP TRIGGER IF EXISTS checklists_set_updated_at ON checklists;
CREATE TRIGGER checklists_set_updated_at
BEFORE UPDATE ON checklists
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists (id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checklist_items_title_check CHECK (char_length(btrim(title)) >= 1)
);

CREATE INDEX IF NOT EXISTS checklist_items_checklist_idx ON checklist_items (checklist_id, sort_order);

DROP TRIGGER IF EXISTS checklist_items_set_updated_at ON checklist_items;
CREATE TRIGGER checklist_items_set_updated_at
BEFORE UPDATE ON checklist_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS checklist_visibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES checklists (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checklist_visibility_unique UNIQUE (checklist_id, user_id)
);

CREATE INDEX IF NOT EXISTS checklist_visibility_user_idx ON checklist_visibility (user_id);
CREATE INDEX IF NOT EXISTS checklist_visibility_checklist_idx ON checklist_visibility (checklist_id);

CREATE TABLE IF NOT EXISTS checklist_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID REFERENCES checklists (id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS checklist_activity_checklist_idx ON checklist_activity (checklist_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_work_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES project_tasks (id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  employee_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  deadline DATE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_work_items_title_check CHECK (char_length(btrim(title)) >= 2),
  CONSTRAINT daily_work_items_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE UNIQUE INDEX IF NOT EXISTS daily_work_items_task_employee_idx ON daily_work_items (task_id, employee_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS daily_work_items_employee_idx ON daily_work_items (employee_id);

DROP TRIGGER IF EXISTS daily_work_items_set_updated_at ON daily_work_items;
CREATE TRIGGER daily_work_items_set_updated_at
BEFORE UPDATE ON daily_work_items
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS daily_work_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES daily_work_items (id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  status VARCHAR(30) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  update_date DATE NOT NULL,
  task_deadline DATE,
  completion_date DATE,
  delay_days INTEGER NOT NULL DEFAULT 0,
  delay_status VARCHAR(30) NOT NULL,
  reason_for_delay TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_work_updates_day_unique UNIQUE (work_item_id, update_date),
  CONSTRAINT daily_work_updates_description_check CHECK (char_length(btrim(description)) >= 1),
  CONSTRAINT daily_work_updates_status_check CHECK (status IN (
    'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD',
    'WAITING_CUSTOMER', 'WAITING_VENDOR', 'WAITING_INTERNAL', 'UNDER_REVIEW'
  )),
  CONSTRAINT daily_work_updates_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT daily_work_updates_delay_check CHECK (delay_status IN (
    'ON_TIME', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'COMPLETED_ON_TIME', 'COMPLETED_LATE', 'BLOCKED'
  ))
);

CREATE INDEX IF NOT EXISTS daily_work_updates_employee_idx ON daily_work_updates (employee_id, update_date);
CREATE INDEX IF NOT EXISTS daily_work_updates_date_idx ON daily_work_updates (update_date);
CREATE INDEX IF NOT EXISTS daily_work_updates_item_idx ON daily_work_updates (work_item_id, update_date DESC);
CREATE INDEX IF NOT EXISTS daily_work_updates_status_idx ON daily_work_updates (status);

DROP TRIGGER IF EXISTS daily_work_updates_set_updated_at ON daily_work_updates;
CREATE TRIGGER daily_work_updates_set_updated_at
BEFORE UPDATE ON daily_work_updates
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS daily_work_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_work_update_id UUID NOT NULL REFERENCES daily_work_updates (id) ON DELETE CASCADE,
  dependency_type VARCHAR(20) NOT NULL,
  employee_id UUID REFERENCES users (id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  external_name VARCHAR(200) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_work_dependencies_type_check CHECK (dependency_type IN (
    'EMPLOYEE', 'TEAM', 'VENDOR', 'CUSTOMER', 'EXTERNAL', 'PROCUREMENT', 'TECHNICAL', 'MATERIAL', 'APPROVAL', 'OTHER'
  ))
);

CREATE INDEX IF NOT EXISTS daily_work_dependencies_update_idx ON daily_work_dependencies (daily_work_update_id);
CREATE INDEX IF NOT EXISTS daily_work_dependencies_employee_idx ON daily_work_dependencies (employee_id);
CREATE INDEX IF NOT EXISTS daily_work_dependencies_team_idx ON daily_work_dependencies (team_id);

CREATE TABLE IF NOT EXISTS daily_work_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID REFERENCES daily_work_items (id) ON DELETE SET NULL,
  update_id UUID REFERENCES daily_work_updates (id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_work_activity_item_idx ON daily_work_activity (work_item_id, created_at DESC);

ALTER TABLE project_time_entries ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ;
ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ;
ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE project_time_entries DROP CONSTRAINT IF EXISTS project_time_entries_span_check;
ALTER TABLE project_time_entries ADD CONSTRAINT project_time_entries_span_check CHECK (
  start_at IS NULL OR end_at IS NULL OR end_at > start_at
);
CREATE INDEX IF NOT EXISTS project_time_entries_user_date_idx ON project_time_entries (user_id, work_date);
CREATE INDEX IF NOT EXISTS project_time_entries_task_idx ON project_time_entries (task_id);
CREATE INDEX IF NOT EXISTS project_time_entries_span_idx ON project_time_entries (user_id, start_at, end_at);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  total_worked_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendance_sessions_user_day_unique UNIQUE (user_id, work_date),
  CONSTRAINT attendance_sessions_span_check CHECK (check_out IS NULL OR check_out > check_in)
);

CREATE INDEX IF NOT EXISTS attendance_sessions_user_idx ON attendance_sessions (user_id, work_date);

DROP TRIGGER IF EXISTS attendance_sessions_set_updated_at ON attendance_sessions;
CREATE TRIGGER attendance_sessions_set_updated_at
BEFORE UPDATE ON attendance_sessions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS break_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_session_id UUID NOT NULL REFERENCES attendance_sessions (id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER,
  break_type VARCHAR(40) NOT NULL DEFAULT 'Break',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT break_entries_span_check CHECK (end_time IS NULL OR end_time > start_time),
  CONSTRAINT break_entries_type_check CHECK (char_length(btrim(break_type)) >= 2)
);

CREATE INDEX IF NOT EXISTS break_entries_session_idx ON break_entries (attendance_session_id, start_time);

CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  what_i_did TEXT NOT NULL DEFAULT '',
  what_to_improve TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  what_i_did_edited BOOLEAN NOT NULL DEFAULT FALSE,
  what_to_improve_edited BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT daily_reports_user_day_unique UNIQUE (user_id, report_date),
  CONSTRAINT daily_reports_status_check CHECK (status IN ('DRAFT', 'SUBMITTED'))
);

CREATE INDEX IF NOT EXISTS daily_reports_user_idx ON daily_reports (user_id, report_date DESC);
CREATE INDEX IF NOT EXISTS daily_reports_status_idx ON daily_reports (status, report_date);

DROP TRIGGER IF EXISTS daily_reports_set_updated_at ON daily_reports;
CREATE TRIGGER daily_reports_set_updated_at
BEFORE UPDATE ON daily_reports
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS daily_report_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_report_id UUID NOT NULL REFERENCES daily_reports (id) ON DELETE CASCADE,
  activity_type VARCHAR(40) NOT NULL,
  reference_id UUID,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_report_activity_report_idx ON daily_report_activity (daily_report_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link VARCHAR(200) NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_calendar (
  id INTEGER PRIMARY KEY DEFAULT 1,
  weekend_days INTEGER[] NOT NULL DEFAULT ARRAY[0, 6],
  CONSTRAINT organization_calendar_single CHECK (id = 1)
);

INSERT INTO organization_calendar (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS organization_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_holidays_name_check CHECK (char_length(btrim(name)) >= 2)
);

CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL,
  code VARCHAR(40) NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  default_annual_allocation NUMERIC(5, 1) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_types_allocation_check CHECK (default_annual_allocation >= 0)
);

DROP TRIGGER IF EXISTS leave_types_set_updated_at ON leave_types;
CREATE TRIGGER leave_types_set_updated_at
BEFORE UPDATE ON leave_types
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO leave_types (name, code, description, default_annual_allocation)
VALUES
  ('Casual', 'CASUAL', 'Casual leave', 12),
  ('Sick', 'SICK', 'Sick leave', 10),
  ('Earned', 'EARNED', 'Earned leave', 12),
  ('Privilege', 'PRIVILEGE', 'Privilege leave', 12),
  ('Compensatory Off', 'COMP_OFF', 'Compensatory off', 0),
  ('Other', 'OTHER', 'Other leave', 0)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types (id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  allocated_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
  used_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
  pending_days NUMERIC(5, 1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_balances_unique UNIQUE (user_id, leave_type_id, year),
  CONSTRAINT leave_balances_non_negative CHECK (allocated_days >= 0 AND used_days >= 0 AND pending_days >= 0)
);

CREATE INDEX IF NOT EXISTS leave_balances_user_idx ON leave_balances (user_id, year);

DROP TRIGGER IF EXISTS leave_balances_set_updated_at ON leave_balances;
CREATE TRIGGER leave_balances_set_updated_at
BEFORE UPDATE ON leave_balances
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS leave_number_counters (
  bucket VARCHAR(20) PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(20) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  leave_type_id UUID NOT NULL REFERENCES leave_types (id) ON DELETE RESTRICT,
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
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approval_comment TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_requests_dates_check CHECK (end_date >= start_date),
  CONSTRAINT leave_requests_days_check CHECK (duration_days > 0),
  CONSTRAINT leave_requests_reason_check CHECK (char_length(btrim(reason)) >= 2),
  CONSTRAINT leave_requests_duration_type_check CHECK (duration_type IN ('FULL', 'FIRST_HALF', 'SECOND_HALF')),
  CONSTRAINT leave_requests_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS leave_requests_user_idx ON leave_requests (user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS leave_requests_status_idx ON leave_requests (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS leave_requests_team_idx ON leave_requests (team_id, status);
CREATE INDEX IF NOT EXISTS leave_requests_type_idx ON leave_requests (leave_type_id);

DROP TRIGGER IF EXISTS leave_requests_set_updated_at ON leave_requests;
CREATE TRIGGER leave_requests_set_updated_at
BEFORE UPDATE ON leave_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS permission_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number VARCHAR(20) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  permission_date DATE NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,
  reason TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approval_comment TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT permission_requests_span_check CHECK (end_time > start_time),
  CONSTRAINT permission_requests_minutes_check CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  CONSTRAINT permission_requests_reason_check CHECK (char_length(btrim(reason)) >= 2),
  CONSTRAINT permission_requests_status_check CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS permission_requests_user_idx ON permission_requests (user_id, permission_date DESC);
CREATE INDEX IF NOT EXISTS permission_requests_status_idx ON permission_requests (status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS permission_requests_team_idx ON permission_requests (team_id, status);

DROP TRIGGER IF EXISTS permission_requests_set_updated_at ON permission_requests;
CREATE TRIGGER permission_requests_set_updated_at
BEFORE UPDATE ON permission_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS leave_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests (id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  action_by UUID REFERENCES users (id) ON DELETE SET NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_approval_history_request_idx ON leave_approval_history (leave_request_id, created_at);

CREATE TABLE IF NOT EXISTS permission_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_request_id UUID NOT NULL REFERENCES permission_requests (id) ON DELETE CASCADE,
  action VARCHAR(40) NOT NULL,
  action_by UUID REFERENCES users (id) ON DELETE SET NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS permission_approval_history_request_idx ON permission_approval_history (permission_request_id, created_at);

CREATE TABLE IF NOT EXISTS leave_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  leave_request_id UUID REFERENCES leave_requests (id) ON DELETE SET NULL,
  permission_request_id UUID REFERENCES permission_requests (id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leave_activity_user_idx ON leave_activity (user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_capacity_hours NUMERIC(4, 1) NOT NULL DEFAULT 40;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_code VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_location VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_weekly_capacity_check;
ALTER TABLE users ADD CONSTRAINT users_weekly_capacity_check CHECK (weekly_capacity_hours > 0 AND weekly_capacity_hours <= 80);
CREATE UNIQUE INDEX IF NOT EXISTS users_employee_code_idx ON users (lower(employee_code)) WHERE employee_code IS NOT NULL AND btrim(employee_code) <> '';
CREATE INDEX IF NOT EXISTS project_tasks_status_end_idx ON project_tasks (status, end_date);
CREATE INDEX IF NOT EXISTS project_tasks_assignee_dates_idx ON project_tasks (assignee_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL,
  name VARCHAR(160),
  description TEXT NOT NULL DEFAULT '',
  group_type VARCHAR(20),
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_type_check CHECK (type IN ('DIRECT', 'GROUP')),
  CONSTRAINT conversations_group_type_check CHECK (group_type IS NULL OR group_type IN ('TEAM', 'PROJECT', 'DEPARTMENT', 'CUSTOM'))
);

CREATE INDEX IF NOT EXISTS conversations_type_idx ON conversations (type, updated_at DESC);

DROP TRIGGER IF EXISTS conversations_set_updated_at ON conversations;
CREATE TRIGGER conversations_set_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  CONSTRAINT conversation_members_unique UNIQUE (conversation_id, user_id),
  CONSTRAINT conversation_members_role_check CHECK (role IN ('MEMBER', 'ADMIN'))
);

CREATE INDEX IF NOT EXISTS conversation_members_user_idx ON conversation_members (user_id, conversation_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users (id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  reply_to_id UUID REFERENCES messages (id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  task_id UUID REFERENCES project_tasks (id) ON DELETE SET NULL,
  delivered_at TIMESTAMPTZ,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_idx ON messages (sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  file_name VARCHAR(240) NOT NULL,
  stored_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments (message_id);

CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS message_pins (
  conversation_id UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  pinned_by UUID REFERENCES users (id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE TABLE IF NOT EXISTS message_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_edits_message_idx ON message_edits (message_id, edited_at);

CREATE TABLE IF NOT EXISTS forum_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  author_id UUID REFERENCES users (id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT forum_threads_category_check CHECK (category IN ('DISCUSSION', 'QUESTION', 'IDEA')),
  CONSTRAINT forum_threads_status_check CHECK (status IN ('OPEN', 'ANSWERED', 'CLOSED', 'PROPOSED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED')),
  CONSTRAINT forum_threads_title_check CHECK (char_length(btrim(title)) >= 3)
);

CREATE INDEX IF NOT EXISTS forum_threads_activity_idx ON forum_threads (last_activity_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_category_idx ON forum_threads (category, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_team_idx ON forum_threads (team_id);

DROP TRIGGER IF EXISTS forum_threads_set_updated_at ON forum_threads;
CREATE TRIGGER forum_threads_set_updated_at
BEFORE UPDATE ON forum_threads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS forum_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES forum_threads (id) ON DELETE CASCADE,
  author_id UUID REFERENCES users (id) ON DELETE SET NULL,
  parent_reply_id UUID REFERENCES forum_replies (id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS forum_replies_thread_idx ON forum_replies (thread_id, created_at);

CREATE TABLE IF NOT EXISTS forum_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS forum_thread_tags (
  thread_id UUID NOT NULL REFERENCES forum_threads (id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES forum_tags (id) ON DELETE CASCADE,
  PRIMARY KEY (thread_id, tag_id)
);

CREATE TABLE IF NOT EXISTS forum_follows (
  thread_id UUID NOT NULL REFERENCES forum_threads (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS forum_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES forum_threads (id) ON DELETE CASCADE,
  reply_id UUID REFERENCES forum_replies (id) ON DELETE CASCADE,
  file_name VARCHAR(240) NOT NULL,
  stored_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT forum_attachments_owner_check CHECK (thread_id IS NOT NULL OR reply_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS forum_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id UUID NOT NULL REFERENCES forum_replies (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT forum_reactions_unique UNIQUE (reply_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS forum_views (
  thread_id UUID NOT NULL REFERENCES forum_threads (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_presence (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_presence_status_check CHECK (status IN ('ONLINE', 'IDLE', 'OFFLINE'))
);

CREATE TABLE IF NOT EXISTS message_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  conversation_id UUID REFERENCES conversations (id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages (id) ON DELETE SET NULL,
  thread_id UUID REFERENCES forum_threads (id) ON DELETE SET NULL,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_activity_created_idx ON message_activity (created_at DESC);

INSERT INTO forum_tags (name) VALUES
  ('WCS'), ('RCS'), ('ROS2'), ('Vision'), ('Procurement'), ('RFQ'),
  ('Customer'), ('Integration'), ('Testing'), ('Bug'), ('Design'), ('Deployment')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS assignment_rule VARCHAR(30) NOT NULL DEFAULT 'TEAM_LEAD_ONLY';
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_assignment_rule_check;
ALTER TABLE teams ADD CONSTRAINT teams_assignment_rule_check CHECK (assignment_rule IN ('TEAM_LEAD_ONLY', 'ANY_TEAM_MEMBER'));
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));
CREATE UNIQUE INDEX IF NOT EXISTS teams_name_active_idx ON teams (lower(name)) WHERE status <> 'ARCHIVED';

CREATE TABLE IF NOT EXISTS team_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  platform VARCHAR(30) NOT NULL DEFAULT 'OTHER',
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_meetings_platform_check CHECK (platform IN ('TEAMS', 'MEET', 'ZOOM', 'OTHER')),
  CONSTRAINT team_meetings_name_check CHECK (char_length(btrim(name)) >= 2)
);

CREATE INDEX IF NOT EXISTS team_meetings_team_idx ON team_meetings (team_id, is_primary DESC, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS team_meetings_primary_idx ON team_meetings (team_id) WHERE is_primary;

DROP TRIGGER IF EXISTS team_meetings_set_updated_at ON team_meetings;
CREATE TRIGGER team_meetings_set_updated_at
BEFORE UPDATE ON team_meetings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS team_work_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams (id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  assigned_to UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_work_requests_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT team_work_requests_status_check CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT team_work_requests_title_check CHECK (char_length(btrim(title)) >= 2)
);

CREATE INDEX IF NOT EXISTS team_work_requests_team_idx ON team_work_requests (team_id, created_at DESC);

DROP TRIGGER IF EXISTS team_work_requests_set_updated_at ON team_work_requests;
CREATE TRIGGER team_work_requests_set_updated_at
BEFORE UPDATE ON team_work_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE teams ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_assignment_rule_check;
ALTER TABLE teams ADD CONSTRAINT teams_assignment_rule_check CHECK (assignment_rule IN (
  'TEAM_LEAD_ONLY', 'ANY_TEAM_MEMBER', 'PM_ONLY', 'ADMIN_ONLY', 'LEAD_AND_PM'
));

ALTER TABLE team_work_requests ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE team_work_requests ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE team_work_requests ADD COLUMN IF NOT EXISTS tag VARCHAR(80) NOT NULL DEFAULT '';
ALTER TABLE team_work_requests ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE team_work_requests ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES project_tasks (id) ON DELETE SET NULL;
ALTER TABLE team_work_requests DROP CONSTRAINT IF EXISTS team_work_requests_priority_check;
ALTER TABLE team_work_requests ADD CONSTRAINT team_work_requests_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT'));
ALTER TABLE team_work_requests DROP CONSTRAINT IF EXISTS team_work_requests_status_check;
ALTER TABLE team_work_requests ADD CONSTRAINT team_work_requests_status_check CHECK (status IN (
  'REQUESTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
));

CREATE TABLE IF NOT EXISTS email_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  provider VARCHAR(20) NOT NULL DEFAULT 'SMTP',
  host VARCHAR(200) NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  username VARCHAR(200) NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  from_name VARCHAR(120) NOT NULL DEFAULT 'CareYu Automation',
  from_email VARCHAR(200) NOT NULL DEFAULT '',
  reply_to VARCHAR(200) NOT NULL DEFAULT '',
  secure BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_settings_singleton CHECK (id = 1)
);

INSERT INTO email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS email_report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(160) NOT NULL,
  type VARCHAR(40) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_report_templates_system_name_idx
  ON email_report_templates (lower(name)) WHERE is_system;

CREATE TABLE IF NOT EXISTS email_reports (
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
  owner_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  frequency VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  send_time VARCHAR(5) NOT NULL DEFAULT '09:00',
  day_of_week SMALLINT,
  day_of_month SMALLINT,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  next_run_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_reports_name_check CHECK (char_length(btrim(name)) >= 2),
  CONSTRAINT email_reports_scope_check CHECK (scope IN ('ORGANIZATION', 'TEAM', 'PROJECT', 'EMPLOYEE', 'CUSTOMER')),
  CONSTRAINT email_reports_status_check CHECK (status IN ('ACTIVE', 'PAUSED', 'DRAFT', 'FAILED')),
  CONSTRAINT email_reports_frequency_check CHECK (frequency IN ('MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  CONSTRAINT email_reports_attachment_check CHECK (attachment IN ('NONE', 'PDF', 'EXCEL'))
);

CREATE INDEX IF NOT EXISTS email_reports_owner_idx ON email_reports (owner_id, status);
CREATE INDEX IF NOT EXISTS email_reports_next_idx ON email_reports (status, next_run_at);

DROP TRIGGER IF EXISTS email_reports_set_updated_at ON email_reports;
CREATE TRIGGER email_reports_set_updated_at
BEFORE UPDATE ON email_reports
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS email_report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES email_reports (id) ON DELETE CASCADE,
  kind VARCHAR(8) NOT NULL,
  recipient_type VARCHAR(30) NOT NULL,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  email VARCHAR(200) NOT NULL DEFAULT '',
  name VARCHAR(160) NOT NULL DEFAULT '',
  CONSTRAINT email_report_recipients_kind_check CHECK (kind IN ('TO', 'CC', 'BCC')),
  CONSTRAINT email_report_recipients_type_check CHECK (recipient_type IN (
    'USER', 'TEAM', 'EMAIL', 'PROJECT_MANAGER', 'TEAM_LEAD', 'TEAM_MEMBERS', 'TASK_ASSIGNEES', 'SALES_OWNER', 'MANAGEMENT'
  ))
);

CREATE INDEX IF NOT EXISTS email_report_recipients_report_idx ON email_report_recipients (report_id);

CREATE TABLE IF NOT EXISTS email_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES email_reports (id) ON DELETE SET NULL,
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
  sent_by UUID REFERENCES users (id) ON DELETE SET NULL,
  is_test BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_of UUID REFERENCES email_report_runs (id) ON DELETE SET NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT email_report_runs_status_check CHECK (status IN ('QUEUED', 'SENT', 'FAILED', 'PARTIAL'))
);

CREATE INDEX IF NOT EXISTS email_report_runs_started_idx ON email_report_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS email_report_runs_report_idx ON email_report_runs (report_id, started_at DESC);

CREATE TABLE IF NOT EXISTS email_report_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES email_report_runs (id) ON DELETE CASCADE,
  kind VARCHAR(8) NOT NULL,
  email VARCHAR(200) NOT NULL,
  name VARCHAR(160) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
  error TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS email_report_deliveries_run_idx ON email_report_deliveries (run_id);

CREATE TABLE IF NOT EXISTS email_report_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES email_reports (id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_report_activity_created_idx ON email_report_activity (created_at DESC);

INSERT INTO email_report_templates (name, type, description, configuration, is_system)
VALUES
  ('Daily Work Summary', 'DAILY_WORK', 'Who submitted work today, what is blocked, and the next action.', '{"sections":["kpis","table"]}'::jsonb, TRUE),
  ('Weekly Team Summary', 'WEEKLY_SUMMARY', 'Assigned, completed, overdue, and logged hours for the week.', '{"sections":["kpis","table"]}'::jsonb, TRUE),
  ('Weekly Project Progress', 'PROJECT_PROGRESS', 'Progress, remaining days, and open work for each project.', '{"sections":["kpis","table"]}'::jsonb, TRUE),
  ('Project Delay Report', 'PROJECT_DELAY', 'Tasks past their deadline and the recovery note.', '{"sections":["kpis","table"],"overdueOnly":true}'::jsonb, TRUE),
  ('Team Workload', 'WORKLOAD', 'Capacity and utilization from the Workload module.', '{"sections":["kpis","table","chart"]}'::jsonb, TRUE),
  ('Monthly Management Summary', 'CUSTOM', 'A management pack of progress, delays, workload, and recent activity.', '{"sections":["kpis","projects","tasks","delays","workload","activity"]}'::jsonb, TRUE)
ON CONFLICT DO NOTHING;

CREATE SEQUENCE IF NOT EXISTS escalation_number_seq START 1;

CREATE TABLE IF NOT EXISTS escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_number INTEGER NOT NULL UNIQUE DEFAULT nextval('escalation_number_seq'),
  title VARCHAR(200) NOT NULL,
  type VARCHAR(40) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  level VARCHAR(20) NOT NULL DEFAULT 'TEAM',
  description TEXT NOT NULL,
  impact_area VARCHAR(30) NOT NULL DEFAULT '',
  impact_severity VARCHAR(20) NOT NULL DEFAULT '',
  recommended_action TEXT NOT NULL DEFAULT '',
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  customer_name VARCHAR(200) NOT NULL DEFAULT '',
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  raised_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  assigned_to UUID REFERENCES users (id) ON DELETE SET NULL,
  task_id UUID REFERENCES project_tasks (id) ON DELETE SET NULL,
  work_request_id UUID REFERENCES team_work_requests (id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads (id) ON DELETE SET NULL,
  feasibility_id UUID REFERENCES feasibility_studies (id) ON DELETE SET NULL,
  costing_id UUID REFERENCES solution_costings (id) ON DELETE SET NULL,
  due_date DATE,
  root_cause TEXT NOT NULL DEFAULT '',
  corrective_action TEXT NOT NULL DEFAULT '',
  preventive_action TEXT NOT NULL DEFAULT '',
  resolution_notes TEXT NOT NULL DEFAULT '',
  resolved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT escalations_title_check CHECK (char_length(btrim(title)) >= 2),
  CONSTRAINT escalations_description_check CHECK (char_length(btrim(description)) >= 2),
  CONSTRAINT escalations_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT escalations_status_check CHECK (status IN (
    'OPEN', 'ASSIGNED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED'
  )),
  CONSTRAINT escalations_level_check CHECK (level IN ('TEAM', 'PROJECT', 'DEPARTMENT', 'MANAGEMENT'))
);

CREATE INDEX IF NOT EXISTS escalations_status_idx ON escalations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS escalations_project_idx ON escalations (project_id);
CREATE INDEX IF NOT EXISTS escalations_team_idx ON escalations (team_id);
CREATE INDEX IF NOT EXISTS escalations_assigned_idx ON escalations (assigned_to);

DROP TRIGGER IF EXISTS escalations_set_updated_at ON escalations;
CREATE TRIGGER escalations_set_updated_at
BEFORE UPDATE ON escalations
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS escalation_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES escalations (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT escalation_comments_message_check CHECK (char_length(btrim(message)) >= 1)
);

CREATE INDEX IF NOT EXISTS escalation_comments_idx ON escalation_comments (escalation_id, created_at);

CREATE TABLE IF NOT EXISTS escalation_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES escalations (id) ON DELETE CASCADE,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS escalation_activity_idx ON escalation_activity (escalation_id, created_at);

CREATE TABLE IF NOT EXISTS escalation_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id UUID NOT NULL REFERENCES escalations (id) ON DELETE CASCADE,
  file_name VARCHAR(240) NOT NULL,
  stored_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS escalation_attachments_idx ON escalation_attachments (escalation_id, created_at);

DROP TABLE IF EXISTS functional_team_members;
DROP TABLE IF EXISTS functional_teams;

CREATE SEQUENCE IF NOT EXISTS procurement_request_number_seq START 1;

CREATE TABLE IF NOT EXISTS procurement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number INTEGER NOT NULL UNIQUE DEFAULT nextval('procurement_request_number_seq'),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  vendor_name VARCHAR(200) NOT NULL DEFAULT '',
  needed_by DATE,
  justification TEXT NOT NULL DEFAULT '',
  requested_by UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT procurement_requests_title_check CHECK (char_length(btrim(title)) >= 2),
  CONSTRAINT procurement_requests_priority_check CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT procurement_requests_status_check CHECK (status IN (
    'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED', 'CANCELLED'
  ))
);

CREATE INDEX IF NOT EXISTS procurement_requests_status_idx ON procurement_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS procurement_requests_project_idx ON procurement_requests (project_id);

DROP TRIGGER IF EXISTS procurement_requests_set_updated_at ON procurement_requests;
CREATE TRIGGER procurement_requests_set_updated_at
BEFORE UPDATE ON procurement_requests
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS procurement_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES procurement_requests (id) ON DELETE CASCADE,
  description VARCHAR(240) NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  unit VARCHAR(40) NOT NULL DEFAULT '',
  estimated_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT procurement_request_items_description_check CHECK (char_length(btrim(description)) >= 1),
  CONSTRAINT procurement_request_items_quantity_check CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS procurement_request_items_request_idx ON procurement_request_items (request_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
UPDATE users SET employment_status = 'INACTIVE' WHERE is_active = FALSE AND employment_status = 'ACTIVE';
ALTER TABLE users ADD COLUMN IF NOT EXISTS joining_date DATE;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_employment_status_check;
ALTER TABLE users ADD CONSTRAINT users_employment_status_check CHECK (employment_status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_not_own_manager;
ALTER TABLE users ADD CONSTRAINT users_not_own_manager CHECK (reporting_manager_id IS NULL OR reporting_manager_id <> id);
CREATE INDEX IF NOT EXISTS users_manager_idx ON users (reporting_manager_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS co_manager_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_not_own_co_manager;
ALTER TABLE users ADD CONSTRAINT users_not_own_co_manager CHECK (co_manager_id IS NULL OR co_manager_id <> id);
CREATE INDEX IF NOT EXISTS users_co_manager_idx ON users (co_manager_id);

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id SMALLINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  module VARCHAR(60) NOT NULL,
  action VARCHAR(20) NOT NULL,
  PRIMARY KEY (role_id, module, action),
  CONSTRAINT role_permissions_action_check CHECK (action IN ('view', 'create', 'edit', 'delete', 'approve'))
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  module VARCHAR(60) NOT NULL,
  action VARCHAR(20) NOT NULL,
  allowed BOOLEAN NOT NULL,
  PRIMARY KEY (user_id, module, action),
  CONSTRAINT user_permission_overrides_action_check CHECK (action IN ('view', 'create', 'edit', 'delete', 'approve'))
);

CREATE TABLE IF NOT EXISTS organization_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  target_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  target_team_id UUID REFERENCES teams (id) ON DELETE SET NULL,
  previous_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS organization_activity_target_idx ON organization_activity (target_user_id, created_at DESC);

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_scope VARCHAR(30) NOT NULL DEFAULT 'TEAM_ONLY';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_scope_check;
ALTER TABLE users ADD CONSTRAINT users_access_scope_check CHECK (access_scope IN ('ORGANIZATION', 'ALL_TEAMS', 'ENGINEERING', 'BUSINESS', 'PROJECTS', 'TEAM_ONLY'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS credentials_initialized_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
UPDATE users SET account_status = 'INACTIVE' WHERE is_active = FALSE AND account_status = 'ACTIVE';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check;
ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITATION'));
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members ADD CONSTRAINT team_members_role_check CHECK (role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER', 'OVERSIGHT', 'PROJECT_COORDINATION'));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'BUSINESS';
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN ('BUSINESS', 'ENGINEERING'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_team_id UUID REFERENCES teams (id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_lead_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assignment_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN (
  'DRAFT', 'SUBMITTED_TO_PM', 'PM_REVIEW', 'CHANGES_REQUESTED', 'ON_HOLD', 'REJECTED',
  'READY_FOR_TEAM_ASSIGNMENT', 'PM_APPROVED', 'FEASIBILITY', 'FEASIBILITY_SUBMITTED',
  'FEASIBILITY_CHANGES_REQUESTED', 'FEASIBILITY_APPROVED', 'COSTING', 'COSTING_SUBMITTED',
  'COSTING_CHANGES_REQUESTED', 'COSTING_APPROVED', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST', 'CONVERTED'
));

CREATE TABLE IF NOT EXISTS quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  costing_id UUID REFERENCES solution_costings (id) ON DELETE SET NULL,
  version_no INTEGER NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  prepared_by UUID REFERENCES users (id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users (id) ON DELETE SET NULL,
  sent_by UUID REFERENCES users (id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  scope TEXT NOT NULL DEFAULT '',
  price NUMERIC(14, 2),
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  validity TEXT NOT NULL DEFAULT '',
  delivery_timeline TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT '',
  warranty TEXT NOT NULL DEFAULT '',
  exclusions TEXT NOT NULL DEFAULT '',
  assumptions TEXT NOT NULL DEFAULT '',
  taxes TEXT NOT NULL DEFAULT '',
  commercial_terms TEXT NOT NULL DEFAULT '',
  customer_response TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quotations_version_unique UNIQUE (lead_id, version_no),
  CONSTRAINT quotations_status_check CHECK (status IN (
    'DRAFT', 'INTERNAL_REVIEW', 'READY_TO_SEND', 'SENT', 'VIEWED', 'EXPIRED', 'ACCEPTED', 'REJECTED'
  ))
);

CREATE TABLE IF NOT EXISTS negotiation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations (id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'ONGOING',
  discussion TEXT NOT NULL DEFAULT '',
  price_change TEXT NOT NULL DEFAULT '',
  scope_change TEXT NOT NULL DEFAULT '',
  timeline_change TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT '',
  remarks TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT negotiation_status_check CHECK (status IN (
    'ONGOING', 'CUSTOMER_REVIEW', 'PRICE_NEGOTIATION', 'SCOPE_NEGOTIATION', 'FINAL_DISCUSSION', 'WON', 'LOST', 'ON_HOLD'
  ))
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  event VARCHAR(80) NOT NULL,
  actor_id UUID REFERENCES users (id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_events_entity_idx ON workflow_events (entity_type, entity_id, created_at);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_team_id UUID REFERENCES teams (id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_review_status VARCHAR(40) NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_reviewed_by UUID REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS handover_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS handover_at TIMESTAMPTZ;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN (
  'NOT_STARTED', 'PLANNING', 'IN_PROGRESS', 'AT_RISK', 'ON_HOLD', 'COMPLETED', 'CANCELLED',
  'READY_FOR_EXECUTION', 'ASSIGNED', 'TEAM_REVIEW', 'TASK_BREAKDOWN', 'COMPLETION_SUBMITTED', 'HANDOVER'
));

CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1;

CREATE TABLE IF NOT EXISTS project_orders (
  project_id UUID PRIMARY KEY,
  order_code VARCHAR(40) NOT NULL UNIQUE,
  order_date DATE,
  payment_status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_PAYMENT',
  payment_confirmed_at TIMESTAMPTZ,
  payment_confirmed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  payment_reference TEXT NOT NULL DEFAULT '',
  payment_notes TEXT NOT NULL DEFAULT '',
  activated_at TIMESTAMPTZ,
  activated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_orders_activated_idx ON project_orders (activated_at);

ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_status_check;
ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_status_check CHECK (status IN (
  'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'ON_HOLD', 'CANCELLED', 'BLOCKED'
));

CREATE TABLE IF NOT EXISTS daily_work_types (
  code VARCHAR(40) PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO daily_work_types (code, name, sort_order) VALUES
  ('PROJECT_WORK', 'Project Work', 10),
  ('INTERNAL', 'Internal Work', 20),
  ('PRODUCT_DEVELOPMENT', 'Product Development', 30),
  ('RND', 'R&D', 40),
  ('TESTING', 'Testing', 50),
  ('RESEARCH', 'Research', 60),
  ('CUSTOMER_SUPPORT', 'Customer Support', 70),
  ('PROCUREMENT', 'Procurement', 80),
  ('DOCUMENTATION', 'Documentation', 90),
  ('MEETING', 'Meeting', 100),
  ('TRAINING', 'Training', 110),
  ('ADMINISTRATION', 'Administration', 120),
  ('SALES_SUPPORT', 'Sales Support', 130),
  ('TECHNICAL_SUPPORT', 'Technical Support', 140),
  ('OTHER', 'Other', 150)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

ALTER TABLE daily_work_updates ALTER COLUMN work_item_id DROP NOT NULL;
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS work_type VARCHAR(40) NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS work_title VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams (id) ON DELETE SET NULL;
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products (id) ON DELETE SET NULL;
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS next_action TEXT NOT NULL DEFAULT '';
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS hours SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS minutes SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS dependency_type VARCHAR(30) NOT NULL DEFAULT '';
ALTER TABLE daily_work_updates ADD COLUMN IF NOT EXISTS dependency_details TEXT NOT NULL DEFAULT '';
ALTER TABLE daily_work_updates DROP CONSTRAINT IF EXISTS daily_work_updates_hours_check;
ALTER TABLE daily_work_updates ADD CONSTRAINT daily_work_updates_hours_check CHECK (
  hours BETWEEN 0 AND 24 AND minutes BETWEEN 0 AND 59 AND (hours * 60 + minutes) <= 1440
);
CREATE INDEX IF NOT EXISTS daily_work_updates_type_idx ON daily_work_updates (work_type, update_date);
CREATE INDEX IF NOT EXISTS daily_work_updates_product_idx ON daily_work_updates (product_id);

CREATE TABLE IF NOT EXISTS daily_work_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES daily_work_updates (id) ON DELETE CASCADE,
  original_name VARCHAR(240) NOT NULL,
  stored_name VARCHAR(240) NOT NULL,
  mime_type VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_work_attachments_update_idx ON daily_work_attachments (update_id, created_at);

CREATE TABLE IF NOT EXISTS system_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_settings_singleton CHECK (id = 1)
);

INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE project_time_entries ADD COLUMN IF NOT EXISTS daily_work_update_id UUID REFERENCES daily_work_updates (id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS project_time_entries_daily_idx
  ON project_time_entries (daily_work_update_id) WHERE daily_work_update_id IS NOT NULL;
