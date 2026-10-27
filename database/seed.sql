-- Foundation roles.
-- Access rules are not enforced yet. Application code should use role code,
-- not a hardcoded display name, when permissions are added later.
-- New accounts receive the employee role.

INSERT INTO roles (code, name, description) VALUES
  ('super_admin', 'Super Admin', 'Full control of the CareYu workspace'),
  ('admin', 'Admin', 'Organization and user administration'),
  ('management', 'Management', 'Cross-functional management access'),
  ('employee', 'Employee', 'Standard workspace access'),
  ('sales', 'Sales', 'Sales and lead activity'),
  ('design', 'Design', 'Design delivery'),
  ('engineering', 'Engineering', 'Engineering delivery'),
  ('procurement', 'Procurement', 'Procurement operations'),
  ('project_manager', 'Project Manager', 'Project delivery ownership'),
  ('team_lead', 'Team Lead', 'Team coordination')
ON CONFLICT (code) DO NOTHING;
