import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { displayValue, formatBytes, formatDate, formatDateTime } from '../../utils/format';
import {
  COMMUNICATION_TYPES,
  DOCUMENT_TYPES,
  INPUT_STATUSES,
  NEXT_STEPS,
  REQUIREMENT_STATUSES,
  RISK_LEVELS,
  RISK_STATUSES,
  SAMPLE_STATUSES,
  SPECIALTY,
  TEAMS,
  TEAM_STATUSES,
  TEST_STATUSES,
  blankCommunication,
  blankInput,
  blankRequirement,
  blankRisk,
  emptyAssessment,
  statusMeta,
  todayIso,
} from './feasibilityModel';
import { Choice, PeopleSelect, ProgressMeter, Section, StatusBadge, TextArea } from './fields';

function ReadItem({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{displayValue(typeof value === 'string' ? value : value || '')}</dd>
    </div>
  );
}

function rowKey(row, index) {
  return row.id || row.key || index;
}

export function OverviewSection({ study, progress, onTab }) {
  const preparedTeams = (study.teams || []).filter((team) => team.status === 'COMPLETED').map((team) => team.teamName);
  const reviewed = (study.teams || []).filter((team) => team.assessment?.reviewedByName);
  return (
    <div className="feas-stack">
      <Section title="Feasibility progress" description="Calculated from team input, the technical assessment, validation, commercial notes, and documents.">
        <ProgressMeter label="Feasibility progress" value={progress.overall} />
        <div className="feas-breakdown">
          <ProgressMeter label="Team inputs" value={progress.teamInputs} />
          <ProgressMeter label="Technical assessment" value={progress.technical} />
          <ProgressMeter label="POC" value={progress.poc} />
          <ProgressMeter label="Commercial assessment" value={progress.commercial} />
          <ProgressMeter label="Documentation" value={progress.documentation} />
        </div>
      </Section>

      <Section
        title="Assigned feasibility teams"
        actions={<Button variant="secondary" size="sm" onClick={() => onTab('teams')}>Open teams</Button>}
      >
        {study.teams.length ? (
          <div className="feas-team-grid">
            {study.teams.map((team) => (
              <article key={team.teamCode} className="feas-team-card">
                <header>
                  <h3>{team.teamName}</h3>
                  <StatusBadge map={TEAM_STATUSES} value={team.status} />
                </header>
                <p>Lead: {team.teamLeadName || 'Not assigned'}</p>
                <p>Due: {formatDate(team.dueDate)}</p>
                <ProgressMeter label="Completion" value={team.completionPercent} />
              </article>
            ))}
          </div>
        ) : <p className="lead-prose">No teams are assigned yet.</p>}
      </Section>

      <Section title="Review">
        <dl className="lead-read">
          <div>
            <dt>Prepared by</dt>
            <dd>
              {preparedTeams.length ? preparedTeams.join(', ') : (study.preparedByName || 'Not submitted')}
              {study.preparedAt ? <span className="feas-muted">{formatDateTime(study.preparedAt)}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Reviewed by</dt>
            <dd>
              {reviewed.length
                ? reviewed.map((team) => `${team.assessment.reviewedByName} · ${team.teamName}`).join('; ')
                : (study.reviewedByName || 'Not reviewed')}
              {study.reviewedAt ? <span className="feas-muted">{formatDateTime(study.reviewedAt)}</span> : null}
            </dd>
          </div>
          <div>
            <dt>Approved by</dt>
            <dd>
              {study.approvedByName || 'Not approved'}
              {study.approvedAt ? <span className="feas-muted">{formatDateTime(study.approvedAt)}</span> : null}
            </dd>
          </div>
        </dl>
        {study.reviewNote ? <p className="lead-prose">{study.reviewNote}</p> : null}
      </Section>

      <Section title="Activity">
        <ol className="lead-timeline">
          {(study.activity || []).length ? study.activity.map((item) => (
            <li key={item.id}>
              <strong>{item.action}</strong>
              <span>{item.actor} · {formatDateTime(item.createdAt)}</span>
            </li>
          )) : <li><strong>No activity yet</strong><span>Actions are recorded as the study moves forward.</span></li>}
        </ol>
      </Section>
    </div>
  );
}

export function ContactSection({ study }) {
  const lead = study.lead || {};
  return (
    <Section title="Customer contact" description="Taken from the linked lead. Update it in the lead record.">
      <dl className="lead-read">
        <ReadItem label="Contact person" value={lead.contactPerson} />
        <ReadItem label="Designation" value={lead.designation} />
        <ReadItem label="Email" value={lead.email} />
        <ReadItem label="Phone" value={lead.phone} />
        <ReadItem label="Office location" value={lead.officeLocation} />
        <ReadItem label="Site location" value={lead.siteLocation} />
      </dl>
    </Section>
  );
}

export function RequirementSection({ study, onStudy }) {
  const access = study.access || {};
  const lead = study.lead || {};
  const details = lead.details || {};
  const canEdit = access.canEditStudy;
  const rows = study.requirements || [];

  function updateRow(index, partial) {
    onStudy((current) => ({
      ...current,
      requirements: current.requirements.map((row, rowIndex) => (rowIndex === index ? { ...row, ...partial } : row)),
    }));
  }

  return (
    <div className="feas-stack">
      <Section title="Customer requirement" description="The requirement stays on the lead. Compare it with what engineering can achieve.">
        <p className="lead-prose">{displayValue(lead.customerRequirement || lead.description)}</p>
        <dl className="lead-read">
          <ReadItem label="Application / use case" value={lead.useCase} />
          <ReadItem label="Technical requirements" value={lead.technicalRequirements} />
          <ReadItem label="Production quantity" value={lead.productionQuantity} />
          <ReadItem label="Cycle time" value={details.cycleTime} />
          <ReadItem label="Accuracy" value={details.accuracy} />
          <ReadItem label="Payload" value={details.payload} />
        </dl>
      </Section>

      <Section
        title="Requirement vs feasibility"
        description="Compare each customer parameter with the proposed or achieved result."
        actions={canEdit ? <Button size="sm" variant="secondary" onClick={() => onStudy((current) => ({ ...current, requirements: [...current.requirements, blankRequirement()] }))}>Add parameter</Button> : null}
      >
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Customer requirement</th>
                <th>Proposed / achieved</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Remarks</th>
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows.map((row, index) => (
                <tr key={rowKey(row, index)}>
                  <td><input className="input" aria-label="Parameter" value={row.parameter} disabled={!canEdit} onChange={(event) => updateRow(index, { parameter: event.target.value })} /></td>
                  <td><input className="input" aria-label="Customer requirement" value={row.customerRequirement} disabled={!canEdit} onChange={(event) => updateRow(index, { customerRequirement: event.target.value })} /></td>
                  <td><input className="input" aria-label="Proposed or achieved" value={row.proposed} disabled={!canEdit} onChange={(event) => updateRow(index, { proposed: event.target.value })} /></td>
                  <td><input className="input" aria-label="Unit" value={row.unit} disabled={!canEdit} onChange={(event) => updateRow(index, { unit: event.target.value })} /></td>
                  <td>
                    <select className="select" aria-label="Requirement status" value={row.status} disabled={!canEdit} onChange={(event) => updateRow(index, { status: event.target.value })}>
                      {Object.entries(REQUIREMENT_STATUSES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select>
                  </td>
                  <td><input className="input" aria-label="Remarks" value={row.remarks} disabled={!canEdit} onChange={(event) => updateRow(index, { remarks: event.target.value })} /></td>
                  {canEdit ? (
                    <td>
                      <Button variant="secondary" size="sm" onClick={() => onStudy((current) => ({ ...current, requirements: current.requirements.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</Button>
                    </td>
                  ) : null}
                </tr>
              )) : (
                <tr><td colSpan={canEdit ? 7 : 6}>No parameters yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Pending customer inputs"
        description="Critical items that are still pending keep the feasibility in More Information Required."
        actions={access.canManageCustomerInputs ? <Button size="sm" variant="secondary" onClick={() => onStudy((current) => ({ ...current, customerInputs: [...current.customerInputs, blankInput()] }))}>Add input</Button> : null}
      >
        <div className="feas-stack">
          {(study.customerInputs || []).length ? study.customerInputs.map((item, index) => (
            <article key={rowKey(item, index)} className="feas-record">
              <div className="feas-grid">
                <label className="field feas-span">
                  <span className="field__label">Information required</span>
                  <input className="input" value={item.informationRequired} disabled={!access.canManageCustomerInputs} onChange={(event) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, informationRequired: event.target.value } : row) }))} />
                </label>
                <label className="field">
                  <span className="field__label">Requested from</span>
                  <input className="input" value={item.requestedFrom} disabled={!access.canManageCustomerInputs} onChange={(event) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, requestedFrom: event.target.value } : row) }))} />
                </label>
                <label className="field">
                  <span className="field__label">Requested date</span>
                  <input className="input" type="date" value={item.requestedDate || ''} disabled={!access.canManageCustomerInputs} onChange={(event) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, requestedDate: event.target.value } : row) }))} />
                </label>
                <label className="field">
                  <span className="field__label">Expected date</span>
                  <input className="input" type="date" value={item.expectedDate || ''} disabled={!access.canManageCustomerInputs} onChange={(event) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, expectedDate: event.target.value } : row) }))} />
                </label>
                <Choice
                  id={`input-status-${index}`}
                  label="Status"
                  value={item.status}
                  disabled={!access.canUpdateCustomerInputs}
                  options={Object.entries(INPUT_STATUSES).map(([value, meta]) => [value, meta.label])}
                  onChange={(status) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, status } : row) }))}
                />
                <label className="field checkbox-row">
                  <input type="checkbox" checked={item.critical !== false} disabled={!access.canManageCustomerInputs} onChange={(event) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, critical: event.target.checked } : row) }))} />
                  <span>Critical</span>
                </label>
                <TextArea id={`input-remarks-${index}`} label="Remarks" rows={2} value={item.remarks} disabled={!access.canUpdateCustomerInputs} onChange={(remarks) => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => rowIndex === index ? { ...row, remarks } : row) }))} />
              </div>
              <div className="feas-record__meta">
                <StatusBadge map={INPUT_STATUSES} value={item.status} />
                {access.canManageCustomerInputs ? <Button variant="secondary" size="sm" onClick={() => onStudy((current) => ({ ...current, customerInputs: current.customerInputs.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</Button> : null}
              </div>
            </article>
          )) : <p className="lead-prose">No customer information is waiting.</p>}
        </div>
      </Section>
    </div>
  );
}

export function TechnicalSection({ study, onStudy }) {
  const disabled = !study.access?.canEditStudy;
  const validation = study.validation || {};
  function setField(key, value) {
    onStudy((current) => ({ ...current, [key]: value }));
  }
  function setValidation(partial) {
    onStudy((current) => ({ ...current, validation: { ...current.validation, ...partial } }));
  }
  return (
    <div className="feas-stack">
      <Section title="Technical assessment" description="The engineering view of the lead. Save a draft at any time.">
        <div className="feas-grid">
          <TextArea id="technical-feasibility" label="Technical feasibility" value={study.technicalFeasibility} disabled={disabled} onChange={(value) => setField('technicalFeasibility', value)} />
          <TextArea id="required-resources" label="Required resources" value={study.requiredResources} disabled={disabled} onChange={(value) => setField('requiredResources', value)} />
          <TextArea id="proposed-solution" label="Proposed solution" value={study.proposedSolution} disabled={disabled} onChange={(value) => setField('proposedSolution', value)} />
          <TextArea id="major-constraints" label="Major constraints" value={study.majorConstraints} disabled={disabled} onChange={(value) => setField('majorConstraints', value)} />
          <TextArea id="estimated-timeline" label="Estimated timeline" value={study.estimatedTimeline} disabled={disabled} onChange={(value) => setField('estimatedTimeline', value)} />
          <TextArea id="required-equipment" label="Required equipment / components" value={study.requiredEquipment} disabled={disabled} onChange={(value) => setField('requiredEquipment', value)} />
          <TextArea id="technical-assumptions" label="Technical assumptions" value={study.technicalAssumptions} disabled={disabled} onChange={(value) => setField('technicalAssumptions', value)} />
          <TextArea id="team-remarks" label="Team remarks" value={study.teamRemarks} disabled={disabled} onChange={(value) => setField('teamRemarks', value)} />
        </div>
      </Section>

      <Section title="Validation / POC" description="Use this for vision, robotics, measurement, automation, and cycle-time checks.">
        <div className="feas-grid">
          <Choice id="sample-available" label="Sample available" value={validation.sampleAvailable} disabled={disabled} options={['No', 'Yes', 'Partial']} onChange={(sampleAvailable) => setValidation({ sampleAvailable })} />
          <label className="field">
            <span className="field__label">Sample received date</span>
            <input className="input" type="date" value={validation.sampleReceivedDate || ''} disabled={disabled} onChange={(event) => setValidation({ sampleReceivedDate: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Sample quantity</span>
            <input className="input" value={validation.sampleQuantity || ''} disabled={disabled} onChange={(event) => setValidation({ sampleQuantity: event.target.value })} />
          </label>
          <Choice id="test-status" label="Test status" value={validation.testStatus} disabled={disabled} options={Object.entries(TEST_STATUSES).map(([value, meta]) => [value, meta.label])} onChange={(testStatus) => setValidation({ testStatus })} />
          <TextArea id="test-required" label="Test required" value={validation.testRequired} disabled={disabled} onChange={(testRequired) => setValidation({ testRequired })} />
          <TextArea id="test-method" label="Test method" value={validation.testMethod} disabled={disabled} onChange={(testMethod) => setValidation({ testMethod })} />
          <TextArea id="test-result" label="Test result" value={validation.testResult} disabled={disabled} onChange={(testResult) => setValidation({ testResult })} />
          <label className="field">
            <span className="field__label">Required accuracy</span>
            <input className="input" value={validation.requiredAccuracy || ''} disabled={disabled} onChange={(event) => setValidation({ requiredAccuracy: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Achieved accuracy</span>
            <input className="input" value={validation.achievedAccuracy || ''} disabled={disabled} onChange={(event) => setValidation({ achievedAccuracy: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Required cycle time</span>
            <input className="input" value={validation.requiredCycleTime || ''} disabled={disabled} onChange={(event) => setValidation({ requiredCycleTime: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Achieved cycle time</span>
            <input className="input" value={validation.achievedCycleTime || ''} disabled={disabled} onChange={(event) => setValidation({ achievedCycleTime: event.target.value })} />
          </label>
          <TextArea id="validation-remarks" label="Validation remarks" value={validation.validationRemarks} disabled={disabled} onChange={(validationRemarks) => setValidation({ validationRemarks })} />
        </div>
        <p className="feas-note">Attach photos, videos, and reports from the Documents tab. Choose POC Evidence as the document type.</p>
      </Section>

      <Section title="Sample information">
        <div className="feas-grid">
          <Choice id="sample-status" label="Sample status" value={validation.sampleStatus} disabled={disabled} options={Object.entries(SAMPLE_STATUSES).map(([value, meta]) => [value, meta.label])} onChange={(sampleStatus) => setValidation({ sampleStatus })} />
          <label className="field">
            <span className="field__label">Sample type</span>
            <input className="input" value={validation.sampleType || ''} disabled={disabled} onChange={(event) => setValidation({ sampleType: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Sample condition</span>
            <input className="input" value={validation.sampleCondition || ''} disabled={disabled} onChange={(event) => setValidation({ sampleCondition: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Sample location</span>
            <input className="input" value={validation.sampleLocation || ''} disabled={disabled} onChange={(event) => setValidation({ sampleLocation: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Sample owner</span>
            <input className="input" value={validation.sampleOwner || ''} disabled={disabled} onChange={(event) => setValidation({ sampleOwner: event.target.value })} />
          </label>
          <TextArea id="sample-remarks" label="Sample remarks" value={validation.sampleRemarks} disabled={disabled} onChange={(sampleRemarks) => setValidation({ sampleRemarks })} />
        </div>
      </Section>

      <RiskSection study={study} onStudy={onStudy} />
    </div>
  );
}

function RiskSection({ study, onStudy }) {
  const disabled = !study.access?.canEditStudy;
  const users = study.directory || [];
  function updateRisk(index, partial) {
    onStudy((current) => ({
      ...current,
      risks: current.risks.map((row, rowIndex) => (rowIndex === index ? { ...row, ...partial } : row)),
    }));
  }
  return (
    <Section
      title="Risks and mitigation"
      actions={disabled ? null : <Button size="sm" variant="secondary" onClick={() => onStudy((current) => ({ ...current, risks: [...current.risks, blankRisk()] }))}>Add risk</Button>}
    >
      <div className="feas-stack">
        {(study.risks || []).length ? study.risks.map((risk, index) => (
          <article key={rowKey(risk, index)} className="feas-record">
            <div className="feas-grid">
              <TextArea id={`risk-${index}`} label="Risk" rows={2} value={risk.risk} disabled={disabled} onChange={(value) => updateRisk(index, { risk: value })} />
              <label className="field">
                <span className="field__label">Category</span>
                <input className="input" value={risk.category} disabled={disabled} onChange={(event) => updateRisk(index, { category: event.target.value })} />
              </label>
              <Choice id={`impact-${index}`} label="Impact" value={risk.impact} disabled={disabled} options={Object.entries(RISK_LEVELS).map(([value, meta]) => [value, meta.label])} onChange={(impact) => updateRisk(index, { impact })} />
              <Choice id={`probability-${index}`} label="Probability" value={risk.probability} disabled={disabled} options={Object.entries(RISK_LEVELS).map(([value, meta]) => [value, meta.label])} onChange={(probability) => updateRisk(index, { probability })} />
              <Choice id={`level-${index}`} label="Risk level" value={risk.riskLevel} disabled={disabled} options={Object.entries(RISK_LEVELS).map(([value, meta]) => [value, meta.label])} onChange={(riskLevel) => updateRisk(index, { riskLevel })} />
              <PeopleSelect id={`risk-owner-${index}`} label="Owner" value={risk.ownerId} users={users} disabled={disabled} onChange={(ownerId) => updateRisk(index, { ownerId })} />
              <label className="field">
                <span className="field__label">Target date</span>
                <input className="input" type="date" value={risk.targetDate || ''} disabled={disabled} onChange={(event) => updateRisk(index, { targetDate: event.target.value })} />
              </label>
              <Choice id={`risk-status-${index}`} label="Status" value={risk.status} disabled={disabled} options={Object.entries(RISK_STATUSES).map(([value, meta]) => [value, meta.label])} onChange={(status) => updateRisk(index, { status })} />
              <TextArea id={`mitigation-${index}`} label="Mitigation" value={risk.mitigation} disabled={disabled} onChange={(mitigation) => updateRisk(index, { mitigation })} />
            </div>
            <div className="feas-record__meta">
              <StatusBadge map={RISK_LEVELS} value={risk.riskLevel} />
              <StatusBadge map={RISK_STATUSES} value={risk.status} />
              {disabled ? null : <Button variant="secondary" size="sm" onClick={() => onStudy((current) => ({ ...current, risks: current.risks.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</Button>}
            </div>
          </article>
        )) : <p className="lead-prose">No risks recorded.</p>}
      </div>
    </Section>
  );
}

export function CommercialSection({ study, onStudy }) {
  const lead = study.lead || {};
  const details = lead.details || {};
  const disabled = !study.access?.canEditStudy;
  return (
    <Section title="Commercial" description="Customer commercial inputs stay on the lead. Add the feasibility view here.">
      <dl className="lead-read">
        <ReadItem label="Estimated project value" value={lead.estimatedValue} />
        <ReadItem label="Customer budget" value={details.budget} />
        <ReadItem label="Expected PO date" value={details.expectedPoDate} />
        <ReadItem label="Commercial requirements" value={lead.commercialRequirements} />
      </dl>
      <div className="feas-grid">
        <label className="field">
          <span className="field__label">Feasibility commercial estimate</span>
          <input className="input" value={study.commercialEstimate || ''} disabled={disabled} onChange={(event) => onStudy((current) => ({ ...current, commercialEstimate: event.target.value }))} />
        </label>
        <TextArea id="commercial-notes" label="Commercial notes" value={study.commercialNotes} disabled={disabled} onChange={(commercialNotes) => onStudy((current) => ({ ...current, commercialNotes }))} />
      </div>
    </Section>
  );
}

export function TeamsSection({ study, users, onStudy, onReviewTeam }) {
  const access = study.access || {};
  const assigned = new Set((study.teams || []).map((team) => team.teamCode));
  const available = TEAMS.filter((team) => !assigned.has(team.code));

  function changeTeam(teamCode, partial, assessment) {
    onStudy((current) => ({
      ...current,
      teams: current.teams.map((team) => {
        if (team.teamCode !== teamCode) return team;
        const next = { ...team, ...partial };
        if (next.status === 'COMPLETED') next.completionPercent = 100;
        if (assessment) {
          next.assessment = { ...team.assessment, ...assessment, specialty: assessment.specialty || team.assessment.specialty };
          next.assessmentDirty = true;
        }
        return next;
      }),
    }));
  }

  return (
    <div className="feas-stack">
      <Section title="Feasibility teams" description="Assign only the teams that need to judge this lead. Each team submits its own assessment.">
        {access.canEditTeams && available.length ? (
          <div className="feas-inline">
            <label className="field">
              <span className="field__label">Add a team</span>
              <select
                className="select"
                defaultValue=""
                aria-label="Add a feasibility team"
                onChange={(event) => {
                  const teamCode = event.target.value;
                  event.target.value = '';
                  if (!teamCode) return;
                  const team = TEAMS.find((item) => item.code === teamCode);
                  onStudy((current) => ({
                    ...current,
                    teams: [...current.teams, {
                      id: '',
                      teamCode,
                      teamName: team.name,
                      teamLeadId: '',
                      teamLeadName: '',
                      memberIds: [],
                      members: [],
                      assignmentDate: todayIso(),
                      dueDate: '',
                      status: 'NOT_STARTED',
                      completionPercent: 0,
                      assessment: emptyAssessment(teamCode),
                      assessmentDirty: false,
                    }],
                  }));
                }}
              >
                <option value="">Select a team</option>
                {available.map((team) => <option key={team.code} value={team.code}>{team.name}</option>)}
              </select>
            </label>
          </div>
        ) : null}
        {!study.startedAt ? <p className="feas-note">Start the feasibility study before assigning teams.</p> : null}
        {(study.teams || []).length ? null : <p className="lead-prose">No teams assigned.</p>}
      </Section>

      {(study.teams || []).map((team) => {
        const canEditAssignment = access.canEditTeams;
        const canEditAssessment = (access.editableTeamIds || []).includes(team.id) || (canEditAssignment && !team.id);
        const canReview = (access.canReviewTeamIds || []).includes(team.id);
        const fields = SPECIALTY[team.teamCode] || [];
        return (
          <article key={team.teamCode} className="lead-section feas-team-panel">
            <header className="feas-team-panel__header">
              <div>
                <h2>{team.teamName}</h2>
                <p>Due {formatDate(team.dueDate)} · Completion {team.completionPercent}%</p>
              </div>
              <StatusBadge map={TEAM_STATUSES} value={team.status} />
            </header>
            <div className="feas-grid">
              <PeopleSelect id={`${team.teamCode}-lead`} label="Team lead" value={team.teamLeadId} users={users} disabled={!canEditAssignment} onChange={(teamLeadId) => changeTeam(team.teamCode, { teamLeadId })} />
              <label className="field">
                <span className="field__label">Assignment date</span>
                <input className="input" type="date" value={team.assignmentDate || ''} disabled={!canEditAssignment} onChange={(event) => changeTeam(team.teamCode, { assignmentDate: event.target.value })} />
              </label>
              <label className="field">
                <span className="field__label">Due date</span>
                <input className="input" type="date" value={team.dueDate || ''} disabled={!canEditAssignment} onChange={(event) => changeTeam(team.teamCode, { dueDate: event.target.value })} />
              </label>
              <Choice id={`${team.teamCode}-status`} label="Status" value={team.status} disabled={!canEditAssessment} options={Object.entries(TEAM_STATUSES).map(([value, meta]) => [value, meta.label])} onChange={(status) => changeTeam(team.teamCode, { status })} />
              <label className="field">
                <span className="field__label">Completion %</span>
                <input className="input" type="number" min="0" max="100" value={team.completionPercent} disabled={!canEditAssessment || team.status === 'COMPLETED'} onChange={(event) => changeTeam(team.teamCode, { completionPercent: event.target.value })} />
              </label>
              <fieldset className="feas-members" disabled={!canEditAssignment}>
                <legend>Assigned members</legend>
                {users.length ? users.map((person) => (
                  <label key={person.id}>
                    <input
                      type="checkbox"
                      checked={(team.memberIds || []).includes(person.id)}
                      onChange={(event) => {
                        const memberIds = new Set(team.memberIds || []);
                        if (event.target.checked) memberIds.add(person.id);
                        else memberIds.delete(person.id);
                        changeTeam(team.teamCode, { memberIds: [...memberIds] });
                      }}
                    />
                    <span>{person.fullName}</span>
                  </label>
                )) : <p>No active users are available.</p>}
              </fieldset>
            </div>
            <ProgressMeter label={`${team.teamName} completion`} value={team.completionPercent} />
            <h3 className="feas-subhead">Team assessment</h3>
            <p className="feas-note">Record only what this team can judge. Other fields can stay blank.</p>
            <div className="feas-grid">
              {fields.map(([key, label]) => (
                <TextArea
                  key={key}
                  id={`${team.teamCode}-${key}`}
                  label={label}
                  rows={3}
                  value={team.assessment?.specialty?.[key] || ''}
                  disabled={!canEditAssessment}
                  onChange={(value) => changeTeam(team.teamCode, {}, {
                    specialty: { ...(team.assessment?.specialty || {}), [key]: value },
                  })}
                />
              ))}
            </div>
            <details className="feas-more">
              <summary>Shared assessment notes</summary>
              <div className="feas-grid">
                {[
                  ['technicalAssessment', 'Technical assessment'],
                  ['requiredResources', 'Required resources'],
                  ['proposedApproach', 'Proposed approach'],
                  ['constraints', 'Constraints'],
                  ['requiredComponents', 'Required components'],
                  ['technicalAssumptions', 'Technical assumptions'],
                  ['risks', 'Risks'],
                  ['remarks', 'Remarks'],
                ].map(([key, label]) => (
                  <TextArea
                    key={key}
                    id={`${team.teamCode}-${key}`}
                    label={label}
                    rows={3}
                    value={team.assessment?.[key] || ''}
                    disabled={!canEditAssessment}
                    onChange={(value) => changeTeam(team.teamCode, {}, { [key]: value, specialty: team.assessment?.specialty || {} })}
                  />
                ))}
              </div>
            </details>
            <div className="feas-record__meta">
              <span>{team.assessment?.reviewedByName ? `Reviewed by ${team.assessment.reviewedByName}` : 'Not reviewed'}</span>
              {canReview && team.id ? <Button size="sm" variant="secondary" onClick={() => onReviewTeam(team)}>Mark reviewed</Button> : null}
              {canEditAssignment ? <Button size="sm" variant="secondary" onClick={() => onStudy((current) => ({ ...current, teams: current.teams.filter((item) => item.teamCode !== team.teamCode) }))}>Remove team</Button> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function ConclusionSection({ study, onStudy }) {
  const disabled = !study.access?.canEditStudy;
  const steps = NEXT_STEPS[study.decision] || [];
  const reasonLabel = study.decision === 'NOT_FEASIBLE' ? 'Reason' : 'Conditions / dependencies';
  return (
    <Section title="Feasibility conclusion" description="Required before the study can be submitted.">
      <div className="feas-grid">
        <Choice
          id="decision"
          label="Decision"
          value={study.decision}
          disabled={disabled}
          placeholder="Select a decision"
          options={[
            ['FEASIBLE', 'Feasible'],
            ['FEASIBLE_WITH_CONDITIONS', 'Feasible with Conditions'],
            ['NOT_FEASIBLE', 'Not Feasible'],
            ['MORE_INFORMATION_REQUIRED', 'More Information Required'],
          ]}
          onChange={(decision) => onStudy((current) => ({
            ...current,
            decision,
            recommendedNextStep: (NEXT_STEPS[decision] || []).includes(current.recommendedNextStep) ? current.recommendedNextStep : '',
          }))}
        />
        <Choice
          id="next-step"
          label="Recommended next step"
          value={study.recommendedNextStep}
          disabled={disabled || !steps.length}
          placeholder={steps.length ? 'Select the next step' : 'Choose a decision first'}
          options={steps}
          onChange={(recommendedNextStep) => onStudy((current) => ({ ...current, recommendedNextStep }))}
        />
        <PeopleSelect id="conclusion-owner" label="Feasibility owner" value={study.ownerId} users={study.directory || []} disabled={!study.access?.canEditCore} onChange={(ownerId) => onStudy((current) => ({ ...current, ownerId }))} />
        <label className="field">
          <span className="field__label">Completion date</span>
          <input className="input" type="date" value={study.completionDate || ''} disabled={disabled} onChange={(event) => onStudy((current) => ({ ...current, completionDate: event.target.value }))} />
        </label>
        <TextArea id="overall-conclusion" label="Overall technical conclusion" value={study.overallConclusion} disabled={disabled} onChange={(overallConclusion) => onStudy((current) => ({ ...current, overallConclusion }))} />
        <TextArea id="conditions" label={reasonLabel} value={study.conditions} disabled={disabled} onChange={(conditions) => onStudy((current) => ({ ...current, conditions }))} helper={study.decision === 'FEASIBLE_WITH_CONDITIONS' ? 'These conditions are shown before solution and costing.' : undefined} />
        <TextArea id="major-risks" label="Major risks" value={study.majorRisks} disabled={disabled} onChange={(majorRisks) => onStudy((current) => ({ ...current, majorRisks }))} />
        <TextArea id="pm-remarks" label="PM remarks" value={study.pmRemarks} disabled={disabled} onChange={(pmRemarks) => onStudy((current) => ({ ...current, pmRemarks }))} />
      </div>
      {study.decision === 'NOT_FEASIBLE' ? <p className="feas-note">A reason is required before this decision can be submitted. Solution and costing stays closed.</p> : null}
      {study.decision === 'MORE_INFORMATION_REQUIRED' ? <p className="feas-note">Add the missing customer information on the Requirement tab before submitting.</p> : null}
    </Section>
  );
}

export function CostingSection({ study, onProceed }) {
  const lead = study.lead || {};
  const canProceed = study.access?.canProceed && ['FEASIBLE', 'FEASIBLE_WITH_CONDITIONS'].includes(study.status);
  return (
    <div className="feas-stack">
      <Section title="Solution and costing handoff" description="Approved feasibility carries the lead, team input, risks, conditions, and proof into costing. Nothing is typed again.">
        {study.decision === 'FEASIBLE_WITH_CONDITIONS' ? (
          <div className="lead-banner lead-banner--warning">
            <strong>Conditions</strong>
            <p>{study.conditions || 'Conditions have not been recorded.'}</p>
          </div>
        ) : null}
        {study.decision === 'NOT_FEASIBLE' ? (
          <div className="lead-banner lead-banner--warning">
            <strong>Not feasible</strong>
            <p>{study.conditions || 'A reason has not been recorded.'}</p>
          </div>
        ) : null}
        <dl className="lead-read">
          <ReadItem label="Lead ID" value={lead.leadCode} />
          <ReadItem label="Customer" value={lead.customerName} />
          <ReadItem label="Application" value={lead.useCase} />
          <ReadItem label="Decision" value={statusMeta({ FEASIBLE: { label: 'Feasible' }, FEASIBLE_WITH_CONDITIONS: { label: 'Feasible with Conditions' }, NOT_FEASIBLE: { label: 'Not Feasible' }, MORE_INFORMATION_REQUIRED: { label: 'More Information Required' } }, study.decision).label} />
          <ReadItem label="Recommended next step" value={study.recommendedNextStep} />
        </dl>
        <div className="lead-actions">
          {canProceed ? <Button onClick={onProceed}>{study.solutionCostingId ? 'Open solution and costing' : 'Create Solution & Costing'}</Button> : null}
          {!canProceed ? <p className="feas-note">Proceed after the project manager approves a feasible or conditional decision.</p> : null}
        </div>
      </Section>
    </div>
  );
}

export function DocumentsSection({ study, uploadType, uploadTeamId, onUploadType, onUploadTeam, onUpload, onView, onDownload, onDelete, currentUserId }) {
  const access = study.access || {};
  return (
    <Section title="Feasibility documents" description="PDF, Office, spreadsheet, presentation, CSV, text, and image files. Each file stays with this feasibility study.">
      {access.canUpload ? (
        <form className="feas-upload" onSubmit={onUpload}>
          <Choice id="document-type" label="Document type" value={uploadType} options={DOCUMENT_TYPES} onChange={onUploadType} />
          <label className="field">
            <span className="field__label">Team</span>
            <select className="select" value={uploadTeamId} onChange={(event) => onUploadTeam(event.target.value)}>
              <option value="">Study document</option>
              {(study.teams || []).filter((team) => team.id).map((team) => <option key={team.id} value={team.id}>{team.teamName}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Files</span>
            <input className="input" type="file" name="documents" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.webp" />
          </label>
          <Button type="submit">Upload Document</Button>
        </form>
      ) : null}
      <div className="lead-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>File name</th>
              <th>Uploaded by</th>
              <th>Uploaded date</th>
              <th>Document type</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(study.documents || []).length ? study.documents.map((document) => (
              <tr key={document.id}>
                <td>{document.name}</td>
                <td>{document.uploadedBy}</td>
                <td>{formatDateTime(document.createdAt)}</td>
                <td>{document.documentType}</td>
                <td>{formatBytes(document.sizeBytes)}</td>
                <td>
                  <div className="lead-row-actions">
                    <Button size="sm" variant="secondary" onClick={() => onView(document)}>View</Button>
                    <Button size="sm" variant="secondary" onClick={() => onDownload(document)}>Download</Button>
                    {access.canDeleteDocuments || document.uploadedById === currentUserId ? (
                      <Button size="sm" variant="danger" onClick={() => onDelete(document)}>Delete</Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={6}>No technical documents uploaded yet. Upload drawings, specifications, POC reports, or vendor documents.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function CommunicationSection({ study, onStudy }) {
  const access = study.access || {};
  const disabled = !access.canEditCommunications;
  return (
    <Section
      title="Customer communication"
      description="A history of emails, calls, meetings, and site visits for this feasibility case."
      actions={disabled ? null : <Button size="sm" variant="secondary" onClick={() => onStudy((current) => ({ ...current, communications: [blankCommunication(), ...current.communications] }))}>Add communication</Button>}
    >
      <div className="feas-stack">
        {(study.communications || []).length ? study.communications.map((item, index) => (
          <article key={rowKey(item, index)} className="feas-record">
            <div className="feas-grid">
              <label className="field">
                <span className="field__label">Date</span>
                <input className="input" type="date" value={item.occurredOn || ''} disabled={disabled} onChange={(event) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, occurredOn: event.target.value } : row) }))} />
              </label>
              <Choice id={`comm-type-${index}`} label="Communication type" value={item.communicationType} disabled={disabled} options={COMMUNICATION_TYPES} onChange={(communicationType) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, communicationType } : row) }))} />
              <label className="field">
                <span className="field__label">Person</span>
                <input className="input" value={item.person} disabled={disabled} onChange={(event) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, person: event.target.value } : row) }))} />
              </label>
              <label className="field">
                <span className="field__label">Subject</span>
                <input className="input" value={item.subject} disabled={disabled} onChange={(event) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, subject: event.target.value } : row) }))} />
              </label>
              <TextArea id={`comm-summary-${index}`} label="Summary" value={item.summary} disabled={disabled} onChange={(summary) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, summary } : row) }))} />
              <TextArea id={`comm-action-${index}`} label="Action required" rows={3} value={item.actionRequired} disabled={disabled} onChange={(actionRequired) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, actionRequired } : row) }))} />
              <label className="field">
                <span className="field__label">Next follow-up date</span>
                <input className="input" type="date" value={item.nextFollowUp || ''} disabled={disabled} onChange={(event) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, nextFollowUp: event.target.value } : row) }))} />
              </label>
              <TextArea id={`comm-remarks-${index}`} label="Remarks" rows={3} value={item.remarks} disabled={disabled} onChange={(remarks) => onStudy((current) => ({ ...current, communications: current.communications.map((row, rowIndex) => rowIndex === index ? { ...row, remarks } : row) }))} />
            </div>
            <div className="feas-record__meta">
              <Badge tone="info">{item.communicationType}</Badge>
              {item.createdBy ? <span>Recorded by {item.createdBy}</span> : <span>Not saved yet</span>}
              {disabled ? null : <Button size="sm" variant="secondary" onClick={() => onStudy((current) => ({ ...current, communications: current.communications.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</Button>}
            </div>
          </article>
        )) : <p className="lead-prose">No customer communication has been recorded.</p>}
      </div>
    </Section>
  );
}
