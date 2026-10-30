import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, FlaskConical, Inbox, Users } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { formatDate, formatDateTime } from '../../utils/format';
import {
  DECISIONS,
  FEASIBILITY_STATUSES,
  DOCUMENT_TYPES,
  INPUT_STATUSES,
  NEXT_STEPS,
  REQUIREMENT_STATUSES,
  RISK_CATEGORIES,
  RISK_LEVELS,
  RISK_STATUSES,
  SOLUTION_DOCUMENT_TYPES,
  SPECIALTY,
  TEAMS,
  TEAM_STATUSES,
  TEST_STATUSES,
  blankInput,
  blankRequirement,
  blankRisk,
  blankTest,
  emptyAssessment,
  solutionStatusMeta,
  statusMeta,
  todayIso,
} from './feasibilityModel';
import { Choice, PeopleSelect, Section, StatusBadge, TextArea } from './fields';

function text(value) {
  const clean = String(value ?? '').trim();
  return clean || 'Not specified';
}

function EmptyNote({ title, detail, action }) {
  return (
    <div className="feas-empty">
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function StudyHeader({
  lead, study, statusInfo, dirty, access, editing, busy,
  onBack, onStart, onEdit, onCancelEdit, onSave, onSubmit, onApprove, onChanges, onReject, onProceed, onUploadTab,
}) {
  const submitLabel = study.submittedAt ? 'Resubmit to PM' : 'Submit to PM';
  const canAssess = Boolean(access.canEditAssessment || access.canEditStudy);
  const solutionInfo = solutionStatusMeta(study);
  return (
    <header className="feas-top">
      <div>
        <button type="button" className="feas-back" onClick={onBack}>← Back to Feasibility Studies</button>
        <h1>Feasibility study</h1>
        <p className="feas-context">
          <span>Lead ID: {lead.leadCode || 'Not specified'}</span>
          <span>Customer: {text(lead.customerName)}</span>
          <span>Project: {text(lead.title)}</span>
        </p>
        <div className="feas-context feas-context--meta">
          <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
          <Badge tone={solutionInfo.tone}>Solution: {solutionInfo.label}</Badge>
          <span>Priority: {text(lead.priority)}</span>
          <span>Owner: {study.ownerName || lead.assignedPm || 'Not assigned'}</span>
          <span>Last updated: {formatDate(study.updatedAt)}</span>
          {dirty ? <span>Unsaved changes</span> : null}
          {canAssess && !dirty ? <span>Fields are editable</span> : null}
        </div>
      </div>
      <div className="feas-top__actions">
        {access.canStart ? <Button onClick={onStart} loading={busy === 'start'} disabled={Boolean(busy)}>Start study</Button> : null}
        {access.canSave ? <Button onClick={onSave} loading={busy === 'save'} disabled={Boolean(busy) || !dirty}>Save Changes</Button> : null}
        {dirty && canAssess ? <Button variant="secondary" onClick={onCancelEdit} disabled={Boolean(busy)}>Discard changes</Button> : null}
        {access.canUpload ? <Button variant="secondary" onClick={onUploadTab} disabled={Boolean(busy)}>Upload Document</Button> : null}
        {access.canSubmit ? <Button onClick={onSubmit} disabled={Boolean(busy) || dirty}>{submitLabel}</Button> : null}
        {access.canRequestChanges ? <Button variant="secondary" onClick={onChanges} disabled={Boolean(busy)}>Request Changes</Button> : null}
        {access.canReject ? <Button variant="danger" onClick={onReject} disabled={Boolean(busy)}>Reject</Button> : null}
        {access.canApprove ? <Button onClick={onApprove} loading={busy === 'approve'} disabled={Boolean(busy)}>Approve</Button> : null}
        {access.canProceed ? (
          <Button onClick={onProceed} loading={busy === 'proceed'} disabled={Boolean(busy)}>
            {study.solutionCostingId ? 'Open Solution & Costing' : 'Move to Solution & Costing'}
          </Button>
        ) : null}
        {access.procurementPending ? (
          <Button variant="secondary" onClick={() => { window.location.href = access.procurementHref || '/procurement-requests'; }} disabled={Boolean(busy)}>
            Open Procurement
          </Button>
        ) : null}
      </div>
    </header>
  );
}

export function SummaryStrip({ statusInfo, counts, pocLabel }) {
  const cards = [
    ['Feasibility status', statusInfo.label, ClipboardList],
    ['Team progress', `${counts.teamsComplete} / ${counts.teamCount || 0}`, Users],
    ['Requirements', `${counts.requirementsValidated} / ${counts.requirementCount || 0}`, CheckCircle2],
    ['Open risks', String(counts.openRisks), AlertTriangle],
    ['Pending inputs', String(counts.pendingInputs), Inbox],
    ['POC / validation', pocLabel, FlaskConical],
  ];
  return (
    <section className="feas-strip" aria-label="Feasibility summary">
      {cards.map(([label, value, Icon]) => (
        <article key={label}>
          <Icon size={15} aria-hidden="true" />
          <p>{label}</p>
          <strong>{value}</strong>
        </article>
      ))}
    </section>
  );
}

export function ProgressTrack({ steps }) {
  return (
    <ol className="feas-track" aria-label="Feasibility progress">
      {steps.map((step) => (
        <li key={step.label} className={`is-${step.state}`}>
          <span>{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}</span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

export function OverviewPanel({ study, counts, pocLabel }) {
  const lead = study.lead || {};
  const details = lead.details || {};
  const pendingTeams = (study.teams || []).filter((team) => team.status !== 'COMPLETED');
  return (
    <div className="feas-split">
      <Section title="Requirement summary">
        <dl className="lead-read">
          <div><dt>Customer requirement</dt><dd>{text(lead.customerRequirement || lead.description)}</dd></div>
          <div><dt>Application</dt><dd>{text(lead.useCase)}</dd></div>
          <div><dt>Industry</dt><dd>{text(lead.businessVertical)}</dd></div>
          <div><dt>Production quantity</dt><dd>{text(lead.productionQuantity)}</dd></div>
          <div><dt>Accuracy</dt><dd>{text(details.accuracy)}</dd></div>
          <div><dt>Cycle time</dt><dd>{text(details.cycleTime)}</dd></div>
          <div><dt>Expected timeline</dt><dd>{text(study.estimatedTimeline || details.timeline)}</dd></div>
        </dl>
      </Section>
      <div className="feas-stack">
        <Section title="Feasibility status">
          <dl className="lead-read">
            <div><dt>Current status</dt><dd>{statusMeta(FEASIBILITY_STATUSES, study.status).label}</dd></div>
            <div><dt>Owner</dt><dd>{study.ownerName || 'Not assigned'}</dd></div>
            <div><dt>Project manager</dt><dd>{lead.assignedPm || 'Not assigned'}</dd></div>
            <div><dt>Last updated</dt><dd>{formatDateTime(study.updatedAt)}</dd></div>
            <div><dt>POC</dt><dd>{pocLabel}</dd></div>
          </dl>
        </Section>
        <Section title="Open items">
          <ul className="feas-points">
            <li>{pendingTeams.length ? `${pendingTeams.length} team assessment${pendingTeams.length === 1 ? '' : 's'} still open` : 'No pending team assessments'}</li>
            <li>{counts.pendingInputs ? `${counts.pendingInputs} customer input${counts.pendingInputs === 1 ? '' : 's'} pending` : 'No pending customer inputs'}</li>
            <li>{counts.openRisks ? `${counts.openRisks} open risk${counts.openRisks === 1 ? '' : 's'}` : 'No open risks'}</li>
          </ul>
        </Section>
        <Section title="Lead">
          <dl className="lead-read">
            <div><dt>Lead ID</dt><dd>{lead.leadCode || 'Not specified'}</dd></div>
            <div><dt>Sales owner</dt><dd>{text(lead.createdBy)}</dd></div>
            <div><dt>Priority</dt><dd>{text(lead.priority)}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(lead.createdAt)}</dd></div>
          </dl>
        </Section>
      </div>
    </div>
  );
}

export function TeamsWorkspace({ study, users, onStudy, onSaveTeam, onReviewTeam }) {
  const access = study.access || {};
  const [openCode, setOpenCode] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [leadId, setLeadId] = useState('');
  const [role, setRole] = useState('SUPPORTING');
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const assigned = new Map((study.teams || []).map((team) => [team.teamCode, team]));

  function changeTeam(teamCode, partial, assessment) {
    onStudy((current) => ({
      ...current,
      teams: current.teams.map((team) => {
        if (team.teamCode !== teamCode) return team;
        const next = { ...team, ...partial };
        if (next.status === 'COMPLETED') next.completionPercent = 100;
        if (assessment) {
          next.assessment = {
            ...team.assessment,
            ...assessment,
            specialty: { ...team.assessment?.specialty, ...assessment.specialty },
          };
          next.assessmentDirty = true;
        }
        return next;
      }),
    }));
  }

  function assignTeams() {
    const additions = selected.filter((code) => !assigned.has(code)).map((code) => {
      const team = TEAMS.find((item) => item.code === code);
      const assessment = emptyAssessment(code);
      assessment.specialty.teamRole = role;
      assessment.specialty.instructions = instructions;
      return {
        id: '',
        teamCode: code,
        teamName: team.name,
        teamLeadId: leadId,
        teamLeadName: users.find((person) => person.id === leadId)?.fullName || users.find((person) => person.id === leadId)?.name || '',
        memberIds: [],
        members: [],
        assignmentDate: todayIso(),
        dueDate,
        status: 'NOT_STARTED',
        completionPercent: 0,
        assessment,
        assessmentDirty: true,
      };
    });
    if (additions.length) {
      onStudy((current) => ({ ...current, teams: [...current.teams, ...additions] }));
    }
    setAssignOpen(false);
    setSelected([]);
  }

  return (
    <div className="feas-stack">
      <Section
        title="Team assignment"
        description="Teams responsible for evaluating this solution."
        actions={access.canEditTeams ? <Button size="sm" onClick={() => setAssignOpen(true)}>+ Assign Team</Button> : null}
      >
        <div className="feas-team-grid">
          {TEAMS.map((definition) => {
            const team = assigned.get(definition.code);
            const roleLabel = team?.assessment?.specialty?.teamRole === 'PRIMARY' ? 'Primary' : team ? 'Supporting' : 'Supporting';
            return (
              <article key={definition.code} className="feas-team-card">
                <header>
                  <h3>{definition.name}</h3>
                  {team ? <StatusBadge map={TEAM_STATUSES} value={team.status} /> : <Badge tone="neutral">Not Assigned</Badge>}
                </header>
                <p>Team lead: {team?.teamLeadName || 'Not assigned'}</p>
                <p>Role: {team ? roleLabel : '—'}</p>
                <p>Progress: {team ? `${team.completionPercent}%` : '—'}</p>
                {team ? <Button size="sm" variant="secondary" onClick={() => setOpenCode(openCode === definition.code ? '' : definition.code)}>{openCode === definition.code ? 'Close' : 'View / Edit'}</Button> : null}
              </article>
            );
          })}
        </div>
        {!study.startedAt ? <p className="feas-note">Start the feasibility study before assigning teams.</p> : null}
      </Section>

      {(study.teams || []).filter((team) => team.teamCode === openCode).map((team) => {
        const canEdit = (access.editableTeamIds || []).includes(team.id) || (access.canEditTeams && !team.id);
        const fields = SPECIALTY[team.teamCode] || [];
        return (
          <article key={team.teamCode} className="lead-section">
            <header className="feas-section__header">
              <div>
                <h2>{team.teamName}</h2>
                <p>{team.assessment?.specialty?.teamRole === 'PRIMARY' ? 'Primary assessment' : 'Supporting assessment'} · {team.teamLeadName || 'Owner not assigned'}</p>
              </div>
              <StatusBadge map={TEAM_STATUSES} value={team.status} />
            </header>
            <div className="feas-grid">
                <TextArea id={`${team.teamCode}-tech`} label="Technical feasibility" rows={3} value={team.assessment?.technicalAssessment} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { technicalAssessment: value })} />
                <TextArea id={`${team.teamCode}-solution`} label="Proposed solution" rows={3} value={team.assessment?.proposedApproach} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { proposedApproach: value })} />
                <TextArea id={`${team.teamCode}-resources`} label="Required resources" rows={3} value={team.assessment?.requiredResources} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { requiredResources: value })} />
                <TextArea id={`${team.teamCode}-constraints`} label="Major constraints" rows={3} value={team.assessment?.constraints} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { constraints: value })} />
                <label className="field">
                  <span className="field__label">Estimated timeline</span>
                  <input className="input" value={team.assessment?.specialty?.estimatedTimeline || ''} disabled={!canEdit} onChange={(event) => changeTeam(team.teamCode, {}, { specialty: { estimatedTimeline: event.target.value } })} />
                </label>
                <TextArea id={`${team.teamCode}-equipment`} label="Required equipment / components" rows={3} value={team.assessment?.requiredComponents} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { requiredComponents: value })} />
                <TextArea id={`${team.teamCode}-assumptions`} label="Technical assumptions" rows={3} value={team.assessment?.technicalAssumptions} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { technicalAssumptions: value })} />
                <TextArea id={`${team.teamCode}-remarks`} label="Team remarks" rows={3} value={team.assessment?.remarks} disabled={!canEdit} onChange={(value) => changeTeam(team.teamCode, {}, { remarks: value })} />
                {fields.map(([key, label]) => (
                  <label className="field" key={key}>
                    <span className="field__label">{label}</span>
                    <input className="input" value={team.assessment?.specialty?.[key] || ''} disabled={!canEdit} onChange={(event) => changeTeam(team.teamCode, {}, { specialty: { [key]: event.target.value } })} />
                  </label>
                ))}
                <div className="feas-top__actions">
                  <Button size="sm" variant="secondary" onClick={() => onSaveTeam(team)} disabled={!canEdit}>Save assessment</Button>
                  <Button size="sm" onClick={() => onSaveTeam(team, 'COMPLETED')} disabled={!canEdit}>Submit assessment</Button>
                  {(access.canReviewTeamIds || []).includes(team.id) ? <Button size="sm" variant="secondary" onClick={() => onReviewTeam(team)}>Mark reviewed</Button> : null}
                </div>
              </div>
          </article>
        );
      })}

      <Modal open={assignOpen} title="Assign teams" onClose={() => setAssignOpen(false)}>
        <div className="feas-stack">
          <fieldset className="feas-members">
            <legend>Select teams</legend>
            {TEAMS.filter((team) => !assigned.has(team.code)).map((team) => (
              <label key={team.code}>
                <input type="checkbox" checked={selected.includes(team.code)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, team.code] : current.filter((code) => code !== team.code))} />
                {team.name}
              </label>
            ))}
          </fieldset>
          <PeopleSelect id="assign-lead" label="Team lead" value={leadId} users={users} onChange={setLeadId} />
          <Choice id="assign-role" label="Team role" value={role} options={[['PRIMARY', 'Primary'], ['SUPPORTING', 'Supporting']]} onChange={setRole} />
          <TextArea id="assign-notes" label="Instructions" value={instructions} onChange={setInstructions} />
          <label className="field">
            <span className="field__label">Target date</span>
            <input className="input" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>
          <div className="lead-actions">
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={assignTeams} disabled={!selected.length}>Assign teams</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function RequirementsPanel({ study, onStudy }) {
  const canEdit = study.access?.canEditStudy;
  const rows = study.requirements || [];
  function updateRow(index, partial) {
    onStudy((current) => ({
      ...current,
      requirements: current.requirements.map((row, rowIndex) => (rowIndex === index ? { ...row, ...partial } : row)),
    }));
  }
  return (
    <Section
      title="Requirement validation"
      actions={canEdit ? <Button size="sm" onClick={() => onStudy((current) => ({ ...current, requirements: [...current.requirements, blankRequirement()] }))}>+ Add requirement</Button> : null}
    >
      {rows.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Customer requirement</th><th>Unit</th><th>Proposed / achievable</th><th>Status</th><th>Remarks</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || row.key || index}>
                  <td>{canEdit ? <input className="input" value={row.customerRequirement || row.parameter} onChange={(event) => updateRow(index, { customerRequirement: event.target.value, parameter: event.target.value })} /> : text(row.customerRequirement || row.parameter)}</td>
                  <td>{canEdit ? <input className="input" value={row.unit} onChange={(event) => updateRow(index, { unit: event.target.value })} /> : text(row.unit)}</td>
                  <td>{canEdit ? <input className="input" value={row.proposed} onChange={(event) => updateRow(index, { proposed: event.target.value })} /> : text(row.proposed)}</td>
                  <td>
                    {canEdit ? (
                      <select className="select" value={row.status} onChange={(event) => updateRow(index, { status: event.target.value })}>
                        {Object.entries(REQUIREMENT_STATUSES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    ) : <StatusBadge map={REQUIREMENT_STATUSES} value={row.status} />}
                  </td>
                  <td>{canEdit ? <input className="input" value={row.remarks} onChange={(event) => updateRow(index, { remarks: event.target.value })} /> : text(row.remarks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote title="No requirements recorded yet." detail="Add the customer parameters that engineering needs to validate, such as accuracy, cycle time, or detection type." />
      )}
    </Section>
  );
}

export function ValidationPanel({ study, onStudy }) {
  const access = study.access || {};
  const canEdit = Boolean(access.canEditStudy || access.canSave);
  const validation = study.validation || { tests: [], testStatus: 'NOT_REQUIRED' };
  const tests = validation.tests || [];
  function setValidation(partial) {
    onStudy((current) => ({ ...current, validation: { ...current.validation, ...partial } }));
  }
  return (
    <Section
      title="Technical validation"
      actions={canEdit ? <Button size="sm" onClick={() => setValidation({ tests: [...tests, blankTest()] })}>+ Add validation test</Button> : null}
    >
      <Choice id="poc-status" label="POC status" value={validation.testStatus || 'NOT_REQUIRED'} disabled={!canEdit} options={Object.entries(TEST_STATUSES).map(([value, meta]) => [value, meta.label])} onChange={(testStatus) => setValidation({ testStatus })} />
      {tests.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead><tr><th>Test</th><th>Date</th><th>Accuracy</th><th>Cycle time</th><th>Status</th></tr></thead>
            <tbody>
              {tests.map((test, index) => (
                <tr key={test.key || index}>
                  <td><input className="input" value={test.name} disabled={!canEdit} onChange={(event) => {
                    const next = tests.slice();
                    next[index] = { ...test, name: event.target.value };
                    setValidation({ tests: next });
                  }} /></td>
                  <td><input className="input" type="date" value={test.testDate || ''} disabled={!canEdit} onChange={(event) => {
                    const next = tests.slice();
                    next[index] = { ...test, testDate: event.target.value };
                    setValidation({ tests: next });
                  }} /></td>
                  <td><input className="input" value={test.accuracy} disabled={!canEdit} onChange={(event) => {
                    const next = tests.slice();
                    next[index] = { ...test, accuracy: event.target.value };
                    setValidation({ tests: next });
                  }} /></td>
                  <td><input className="input" value={test.cycleTime} disabled={!canEdit} onChange={(event) => {
                    const next = tests.slice();
                    next[index] = { ...test, cycleTime: event.target.value };
                    setValidation({ tests: next });
                  }} /></td>
                  <td>
                    <select className="select" value={test.status} disabled={!canEdit} onChange={(event) => {
                      const next = tests.slice();
                      next[index] = { ...test, status: event.target.value };
                      setValidation({ tests: next });
                    }}>
                      {Object.entries(TEST_STATUSES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote title="No validation tests yet." detail="Run a technical validation test to confirm accuracy, cycle time, or integration feasibility." />
      )}
    </Section>
  );
}

export function RisksPanel({ study, users = [], onStudy }) {
  const canEdit = study.access?.canEditStudy;
  const risks = study.risks || [];
  const inputs = study.customerInputs || [];
  const open = risks.filter((risk) => risk.status === 'OPEN' || risk.status === 'MITIGATING');
  function updateRisk(index, partial) {
    onStudy((current) => ({ ...current, risks: current.risks.map((row, rowIndex) => (rowIndex === index ? { ...row, ...partial } : row)) }));
  }
  function updateInput(index, partial) {
    onStudy((current) => ({ ...current, customerInputs: current.customerInputs.map((row, rowIndex) => (rowIndex === index ? { ...row, ...partial } : row)) }));
  }
  return (
    <div className="feas-stack">
      <Section title="Risks and constraints" actions={canEdit ? <Button size="sm" onClick={() => onStudy((current) => ({ ...current, risks: [...current.risks, blankRisk()] }))}>+ Add risk</Button> : null}>
        <p className="feas-note">Open {open.length} · High {open.filter((risk) => risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL').length}</p>
        {risks.length ? (
          <div className="lead-table-wrap">
            <table className="data-table">
              <thead><tr><th>Risk</th><th>Category</th><th>Impact</th><th>Probability</th><th>Severity</th><th>Mitigation</th><th>Owner</th><th>Status</th></tr></thead>
              <tbody>
                {risks.map((risk, index) => (
                  <tr key={risk.id || risk.key || index}>
                    <td><input className="input" value={risk.risk} disabled={!canEdit} onChange={(event) => updateRisk(index, { risk: event.target.value })} /></td>
                    <td>
                      <select className="select" value={risk.category} disabled={!canEdit} onChange={(event) => updateRisk(index, { category: event.target.value })}>
                        <option value="">Select</option>
                        {RISK_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={risk.impact} disabled={!canEdit} onChange={(event) => updateRisk(index, { impact: event.target.value })}>
                        {Object.entries(RISK_LEVELS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={risk.probability} disabled={!canEdit} onChange={(event) => updateRisk(index, { probability: event.target.value })}>
                        {Object.entries(RISK_LEVELS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={risk.riskLevel} disabled={!canEdit} onChange={(event) => updateRisk(index, { riskLevel: event.target.value })}>
                        {Object.entries(RISK_LEVELS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    </td>
                    <td><input className="input" value={risk.mitigation} disabled={!canEdit} onChange={(event) => updateRisk(index, { mitigation: event.target.value })} /></td>
                    <td>
                      <select className="select" value={risk.ownerId || ''} disabled={!canEdit} onChange={(event) => updateRisk(index, { ownerId: event.target.value })}>
                        <option value="">Not assigned</option>
                        {users.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="select" value={risk.status} disabled={!canEdit} onChange={(event) => updateRisk(index, { status: event.target.value })}>
                        {Object.entries(RISK_STATUSES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote title="No risks recorded." detail="Add technical, procurement, execution, or customer risks that could change the feasibility decision." />}
      </Section>
      <Section title="Pending customer inputs" actions={study.access?.canManageCustomerInputs ? <Button size="sm" onClick={() => onStudy((current) => ({ ...current, customerInputs: [...current.customerInputs, blankInput()] }))}>+ Add input</Button> : null}>
        {inputs.length ? (
          <div className="lead-table-wrap">
            <table className="data-table">
              <thead><tr><th>Required input</th><th>Requested on</th><th>Owner</th><th>Due date</th><th>Status</th></tr></thead>
              <tbody>
                {inputs.map((item, index) => (
                  <tr key={item.id || item.key || index}>
                    <td><input className="input" value={item.informationRequired} disabled={!canEdit} onChange={(event) => updateInput(index, { informationRequired: event.target.value })} /></td>
                    <td>{formatDate(item.requestedDate) || 'Not specified'}</td>
                    <td><input className="input" value={item.requestedFrom} disabled={!canEdit} onChange={(event) => updateInput(index, { requestedFrom: event.target.value })} /></td>
                    <td><input className="input" type="date" value={item.expectedDate || ''} disabled={!canEdit} onChange={(event) => updateInput(index, { expectedDate: event.target.value })} /></td>
                    <td>
                      <select className="select" value={item.status} disabled={!study.access?.canUpdateCustomerInputs} onChange={(event) => updateInput(index, { status: event.target.value })}>
                        {Object.entries(INPUT_STATUSES).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote title="No customer inputs are waiting." detail="Record missing samples, drawings, or specifications so the study does not stall." />}
      </Section>
    </div>
  );
}

export function FeasibilitySolutionPanel({
  study,
  users,
  onStudy,
  onProceed,
  onSave,
  onSubmit,
  onApprove,
  onChanges,
  onReject,
  uploadType,
  uploadTeamId,
  onUploadType,
  onUploadTeam,
  onUpload,
  onView,
  onDownload,
  onDelete,
  currentUserId,
  busy,
  dirty,
  editing,
}) {
  const access = study.access || {};
  const lead = study.lead || {};
  const disabled = !(access.canEditStudy || access.canEditCore || access.canSave);
  const canUpload = Boolean(access.canUpload || access.canSave || access.canEditStudy);
  const steps = NEXT_STEPS[study.decision] || [];
  const solutionInfo = solutionStatusMeta(study);
  const documents = study.documents || [];
  const submitLabel = study.submittedAt ? 'Resubmit to PM' : 'Submit to PM';

  return (
    <div className="feas-stack">
      <Section
        title="Feasibility Solution"
        description="Capture the proposed solution package, attach supporting files, and submit to the project manager for review."
        actions={<Badge tone={solutionInfo.tone}>{solutionInfo.label}</Badge>}
      >
        <dl className="lead-read feas-solution-meta">
          <div><dt>Lead</dt><dd>{lead.leadCode || '—'} · {text(lead.customerName)}</dd></div>
          <div><dt>Project</dt><dd>{text(lead.title)}</dd></div>
          <div><dt>Owner</dt><dd>{study.ownerName || 'Not assigned'}</dd></div>
          <div><dt>Submitted</dt><dd>{study.submittedAt ? `${study.submittedByName || '—'} · ${formatDateTime(study.submittedAt)}` : 'Not submitted'}</dd></div>
          {study.reviewedAt ? <div><dt>Last PM review</dt><dd>{study.reviewedByName || '—'} · {formatDateTime(study.reviewedAt)}</dd></div> : null}
          {study.reviewNote ? <div><dt>PM comments</dt><dd>{study.reviewNote}</dd></div> : null}
        </dl>
      </Section>

      <Section title="Basic information" description="Complete the solution summary for engineering and PM review.">
        <div className="feas-grid">
          <TextArea
            id="solution-summary"
            label="Feasibility summary"
            rows={3}
            value={study.overallConclusion}
            disabled={disabled}
            onChange={(overallConclusion) => onStudy((current) => ({ ...current, overallConclusion }))}
          />
          <TextArea
            id="proposed-solution"
            label="Proposed solution"
            rows={3}
            value={study.proposedSolution}
            disabled={disabled}
            onChange={(proposedSolution) => onStudy((current) => ({ ...current, proposedSolution }))}
          />
          <TextArea
            id="technical-requirements"
            label="Technical requirements"
            rows={3}
            value={study.technicalFeasibility}
            disabled={disabled}
            onChange={(technicalFeasibility) => onStudy((current) => ({ ...current, technicalFeasibility }))}
          />
          <TextArea
            id="key-dependencies"
            label="Key dependencies"
            rows={3}
            value={study.majorRisks}
            disabled={disabled}
            onChange={(majorRisks) => onStudy((current) => ({ ...current, majorRisks }))}
          />
          <label className="field">
            <span className="field__label">Estimated timeline</span>
            <input
              className="input"
              value={study.estimatedTimeline || ''}
              disabled={disabled}
              onChange={(event) => onStudy((current) => ({ ...current, estimatedTimeline: event.target.value }))}
              placeholder="e.g. 12–16 weeks after PO"
            />
          </label>
          <label className="field">
            <span className="field__label">Estimated cost</span>
            <input
              className="input"
              value={study.commercialEstimate || ''}
              disabled={disabled}
              onChange={(event) => onStudy((current) => ({ ...current, commercialEstimate: event.target.value }))}
              placeholder="e.g. ₹45–55 L"
            />
          </label>
          <TextArea
            id="solution-risks"
            label="Risks"
            rows={3}
            value={study.majorConstraints}
            disabled={disabled}
            onChange={(majorConstraints) => onStudy((current) => ({ ...current, majorConstraints }))}
          />
          <TextArea
            id="solution-recommendations"
            label="Recommendations"
            rows={3}
            value={study.pmRemarks}
            disabled={disabled}
            onChange={(pmRemarks) => onStudy((current) => ({ ...current, pmRemarks }))}
          />
          <Choice
            id="solution-decision"
            label="Feasibility decision"
            value={study.decision}
            disabled={disabled}
            options={[['', 'Not decided'], ...DECISIONS]}
            onChange={(decision) => onStudy((current) => ({ ...current, decision, recommendedNextStep: '' }))}
          />
          <label className="field">
            <span className="field__label">Recommended next step</span>
            <select
              className="select"
              value={study.recommendedNextStep}
              disabled={disabled}
              onChange={(event) => onStudy((current) => ({ ...current, recommendedNextStep: event.target.value }))}
            >
              <option value="">Select</option>
              {steps.map((step) => <option key={step}>{step}</option>)}
            </select>
          </label>
          <TextArea
            id="solution-conditions"
            label="Conditions / caveats"
            rows={3}
            value={study.conditions}
            disabled={disabled}
            onChange={(conditions) => onStudy((current) => ({ ...current, conditions }))}
          />
          <PeopleSelect
            id="solution-owner"
            label="Prepared by"
            value={study.ownerId}
            users={users}
            disabled={disabled}
            onChange={(ownerId) => onStudy((current) => ({ ...current, ownerId }))}
          />
          <label className="field">
            <span className="field__label">Decision date</span>
            <input
              className="input"
              type="date"
              value={study.completionDate || ''}
              disabled={disabled}
              onChange={(event) => onStudy((current) => ({ ...current, completionDate: event.target.value }))}
            />
          </label>
        </div>
      </Section>

      <Section title="Solution documents" description="Upload feasibility reports, solution documents, drawings, and supporting files.">
        {canUpload ? (
          <form className="feas-upload" onSubmit={onUpload}>
            <Choice
              id="solution-document-type"
              label="Document category"
              value={uploadType}
              options={SOLUTION_DOCUMENT_TYPES}
              onChange={onUploadType}
            />
            <label className="field">
              <span className="field__label">Team</span>
              <select className="select" value={uploadTeamId} onChange={(event) => onUploadTeam(event.target.value)}>
                <option value="">Study document</option>
                {(study.teams || []).filter((team) => team.id).map((team) => (
                  <option key={team.id} value={team.id}>{team.teamName}</option>
                ))}
              </select>
            </label>
            <label className="field is-wide">
              <span className="field__label">Files</span>
              <input
                className="input"
                type="file"
                name="documents"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.webp,.dwg,.dxf"
              />
            </label>
            <Button type="submit" loading={busy === 'upload'} disabled={busy === 'upload'}>Upload Document</Button>
          </form>
        ) : (
          <p className="feas-note">You do not have permission to upload documents on this study.</p>
        )}
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>File name</th>
                <th>Category</th>
                <th>Uploaded by</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.length ? documents.map((document) => {
                const canDelete = document.canDelete !== false && (access.canDeleteDocuments || document.uploadedById === currentUserId);
                return (
                  <tr key={document.id}>
                    <td>{document.name}</td>
                    <td>{document.documentType || 'Other'}</td>
                    <td>{document.uploadedBy}</td>
                    <td>{formatDateTime(document.createdAt)}</td>
                    <td>
                      <div className="lead-row-actions">
                        <Button size="sm" variant="secondary" onClick={() => onView(document)}>View</Button>
                        <Button size="sm" variant="secondary" onClick={() => onDownload(document)}>Download</Button>
                        {canDelete ? <Button size="sm" variant="danger" onClick={() => onDelete(document)}>Delete</Button> : null}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={5}>No solution documents uploaded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Actions" description="Save your work, submit to the project manager, or continue after approval.">
        <div className="feas-solution-actions">
          {access.canSave ? (
            <Button onClick={onSave} loading={busy === 'save'} disabled={Boolean(busy) || !dirty}>Save Solution</Button>
          ) : null}
          {access.canSubmit ? (
            <Button className="feas-submit-pm" onClick={onSubmit} disabled={Boolean(busy) || dirty} loading={busy === 'submit'}>
              {submitLabel}
            </Button>
          ) : null}
          {access.canRequestChanges ? (
            <Button variant="secondary" onClick={onChanges} disabled={Boolean(busy)}>Request Rework</Button>
          ) : null}
          {access.canReject ? (
            <Button variant="danger" onClick={onReject} disabled={Boolean(busy)}>Reject</Button>
          ) : null}
          {access.canApprove ? (
            <Button onClick={onApprove} loading={busy === 'approve'} disabled={Boolean(busy)}>Approve Solution</Button>
          ) : null}
          {access.canProceed && (study.decision === 'FEASIBLE' || study.decision === 'FEASIBLE_WITH_CONDITIONS') ? (
            <Button onClick={onProceed} loading={busy === 'proceed'}>
              {study.solutionCostingId ? 'Open Solution & Costing' : study.decision === 'FEASIBLE_WITH_CONDITIONS' ? 'Proceed with conditions' : 'Proceed to Solution & Costing'}
            </Button>
          ) : null}
        </div>
        {solutionInfo.key === 'REWORK' ? (
          <p className="feas-note">PM requested rework. Update the solution and documents, then resubmit to PM.</p>
        ) : null}
        {study.status === 'UNDER_REVIEW' ? (
          <p className="feas-note">This solution is locked for PM review. Project managers can approve or request changes with comments.</p>
        ) : null}
        {study.decision === 'NOT_FEASIBLE' ? (
          <p className="feas-note">A reason is required. Solution and costing stays closed for Not Feasible decisions.</p>
        ) : null}
      </Section>
    </div>
  );
}

/** @deprecated Prefer FeasibilitySolutionPanel */
export function ConclusionPanel(props) {
  return <FeasibilitySolutionPanel {...props} />;
}

export function ActivityPanel({ activity }) {
  const rows = activity || [];
  return (
    <Section title="Activity">
      {rows.length ? (
        <ol className="lead-timeline">
          {rows.map((item) => (
            <li key={item.id}>
              <strong>{item.action}</strong>
              <span>{formatDateTime(item.createdAt)} · {item.actor || 'Workspace'}</span>
            </li>
          ))}
        </ol>
      ) : <EmptyNote title="No activity yet." detail="Assignments, saves, submissions, and approvals appear here as the study moves forward." />}
    </Section>
  );
}

export { DOCUMENT_TYPES };
