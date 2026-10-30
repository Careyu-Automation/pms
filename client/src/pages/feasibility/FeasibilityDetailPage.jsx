import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loader } from '../../components/ui/Loader';
import { Modal } from '../../components/ui/Modal';
import {
  CommunicationSection,
  DocumentsSection,
  TechnicalAssessmentSection,
} from '../../components/feasibility/FeasibilitySections';
import {
  ActivityPanel,
  FeasibilitySolutionPanel,
  OverviewPanel,
  ProgressTrack,
  RequirementsPanel,
  RisksPanel,
  StudyHeader,
  SummaryStrip,
  TeamsWorkspace,
  ValidationPanel,
} from '../../components/feasibility/FeasibilityWorkspace';
import {
  FEASIBILITY_STATUSES,
  SOLUTION_DOCUMENT_TYPES,
  TABS,
  TEST_STATUSES,
  calculateProgress,
  statusMeta,
  submitIssues,
  summarize,
  workflowSteps,
} from '../../components/feasibility/feasibilityModel';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  deleteStudyDocument,
  downloadStudyDocument,
  getStudy,
  proceedStudy,
  reviewStudy,
  saveStudy,
  startStudy,
  submitStudy,
  uploadStudyDocuments,
  viewStudyDocument,
} from '../../services/feasibility.service';
import '../../styles/lead.css';
import '../../styles/feasibility.css';

function snapshot(study) {
  const copy = { ...study };
  delete copy.access;
  delete copy.progress;
  delete copy.summary;
  delete copy.lead;
  delete copy.activity;
  delete copy.documents;
  delete copy.directory;
  return JSON.stringify(copy);
}

export default function FeasibilityDetailPage() {
  const { studyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const [study, setStudy] = useState(null);
  const [users, setUsers] = useState([]);
  const [savedKey, setSavedKey] = useState('');
  const [tab, setTab] = useState('overview');
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState('');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [proceedOpen, setProceedOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [changesNote, setChangesNote] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [uploadType, setUploadType] = useState('Customer Requirements');
  const [solutionUploadType, setSolutionUploadType] = useState(SOLUTION_DOCUMENT_TYPES[0]);
  const [uploadTeamId, setUploadTeamId] = useState('');
  const [editing, setEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);

  const apply = useCallback((next) => {
    setStudy(next);
    setSavedKey(snapshot(next));
  }, []);

  const load = useCallback(() => {
    setStatus('loading');
    return getStudy(studyId)
      .then((payload) => {
        apply(payload.data.study);
        setUsers(payload.data.users || []);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [apply, push, studyId]);

  useEffect(() => {
    load();
  }, [load]);

  useDocumentTitle(study?.lead?.leadCode ? `${study.lead.leadCode} · Feasibility` : 'Feasibility study');

  if (status === 'loading') return <Loader label="Loading feasibility study" />;
  if (status === 'error' || !study) {
    return (
      <PageContainer>
        <ErrorState title="This feasibility study could not be loaded." action={<Button onClick={() => navigate('/feasibility-studies')}>Back to feasibility studies</Button>} />
      </PageContainer>
    );
  }

  const access = study.access || {};
  // Fields follow server permissions directly — no extra "Edit Assessment" lock.
  const view = { ...study, directory: users, access };
  const progress = calculateProgress(study);
  const counts = summarize(study);
  const statusInfo = statusMeta(FEASIBILITY_STATUSES, study.status);
  const pocInfo = statusMeta(TEST_STATUSES, counts.pocStatus);
  const dirty = snapshot(study) !== savedKey;
  const steps = workflowSteps(study);
  const lead = study.lead || {};

  function beginEdit() {
    setEditSnapshot(snapshot(study));
    setEditing(true);
  }

  function cancelEdit() {
    try {
      const restored = JSON.parse(savedKey);
      setStudy((current) => ({
        ...current,
        ...restored,
        access: current.access,
        progress: current.progress,
        summary: current.summary,
        lead: current.lead,
        activity: current.activity,
        documents: current.documents,
        directory: current.directory,
      }));
    } catch {
      load();
    }
    setEditing(false);
    setEditSnapshot(null);
  }

  async function onSave() {
    setBusy('save');
    try {
      let current = study;
      if (access.canStart && !study.startedAt) {
        const started = await startStudy(study.id, {
          ownerId: study.ownerId,
          targetCompletionDate: study.targetCompletionDate,
        });
        current = started.data.study;
        apply(current);
      }
      const result = await saveStudy(current.id, { ...study, ...current, access: undefined });
      apply(result.data.study);
      setEditing(false);
      setEditSnapshot(null);
      push({ tone: 'success', message: study.startedAt || current.startedAt ? 'Changes saved.' : 'Study started and changes saved.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function onStart() {
    setBusy('start');
    try {
      let current = study;
      if (dirty && access.canSave) {
        const saved = await saveStudy(study.id, study);
        current = saved.data.study;
      }
      const result = await startStudy(current.id, {
        ownerId: current.ownerId,
        targetCompletionDate: current.targetCompletionDate,
      });
      apply(result.data.study);
      setEditing(true);
      setEditSnapshot(snapshot(result.data.study));
      push({ tone: 'success', message: 'Feasibility study started. You can edit the fields now.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  function askSubmit() {
    const issues = submitIssues(study);
    const missing = Object.values(issues);
    if (missing.length) {
      push({ tone: 'warning', message: missing[0] });
      if (issues.teams) setTab('teams');
      else if (issues.documents) setTab('documents');
      else if (issues.validation || issues.technicalFeasibility || issues.estimatedTimeline) setTab('validation');
      else if (issues.risks || issues.customerInputs) setTab('risks');
      else setTab('solution');
      return;
    }
    setSubmitOpen(true);
  }

  async function onSubmit() {
    if (busy === 'submit') return;
    if (editing && dirty) {
      push({ tone: 'warning', message: 'Save or cancel your edits before submitting for PM review.' });
      return;
    }
    setBusy('submit');
    try {
      const result = await submitStudy(study.id, study);
      apply(result.data.study);
      setEditing(false);
      setEditSnapshot(null);
      setSubmitOpen(false);
      push({ tone: 'success', message: study.submittedAt ? 'Feasibility resubmitted for PM review.' : 'Feasibility submitted for PM review.' });
      setTab('review');
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function onReview(action) {
    if (busy === action) return;
    if ((action === 'changes' || action === 'reject') && String(changesNote || '').trim().length < 2) {
      push({ tone: 'warning', message: action === 'reject' ? 'A rejection reason is required.' : 'Describe the changes needed.' });
      return;
    }
    setBusy(action);
    try {
      const result = await reviewStudy(study.id, { action, note: changesNote });
      apply(result.data.study);
      setChangesOpen(false);
      setRejectOpen(false);
      setChangesNote('');
      const messages = {
        approve: 'Feasibility approved.',
        changes: 'Rework requested. The feasibility team can update the solution and resubmit.',
        reject: 'Feasibility rejected.',
      };
      push({ tone: 'success', message: messages[action] || 'Review recorded.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function onSaveTeam(team, nextStatus) {
    const next = {
      ...study,
      teams: study.teams.map((item) => (item.teamCode === team.teamCode ? {
        ...team,
        status: nextStatus || team.status,
        completionPercent: nextStatus === 'COMPLETED' ? 100 : team.completionPercent,
        assessmentDirty: true,
      } : item)),
    };
    setBusy('save');
    try {
      const result = await saveStudy(study.id, next);
      apply(result.data.study);
      push({ tone: 'success', message: nextStatus === 'COMPLETED' ? 'Assessment submitted.' : 'Assessment saved.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function onReviewTeam(team) {
    setBusy('team');
    try {
      let current = study;
      if (dirty && access.canSave) {
        const saved = await saveStudy(study.id, study);
        current = saved.data.study;
        apply(current);
      }
      const result = await reviewStudy(current.id, { action: 'team_review', assignmentId: team.id, teamCode: team.teamCode });
      apply(result.data.study);
      push({ tone: 'success', message: `${team.teamName} assessment reviewed.` });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function onProceed() {
    if (study.status === 'FEASIBLE_WITH_CONDITIONS' && !proceedOpen) {
      setProceedOpen(true);
      return;
    }
    setBusy('proceed');
    try {
      const result = await proceedStudy(study.id);
      apply(result.data.study);
      setProceedOpen(false);
      navigate(`/solution-costing/${result.data.costingId}`);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function uploadDocuments(event, documentType) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input[type="file"]');
    if (!input?.files?.length) {
      push({ tone: 'warning', message: 'Choose a file to upload.' });
      return;
    }
    const formData = new FormData();
    formData.append('documentType', documentType || uploadType);
    if (uploadTeamId) formData.append('assignmentId', uploadTeamId);
    [...input.files].forEach((file) => formData.append('documents', file));
    setBusy('upload');
    try {
      const result = await uploadStudyDocuments(study.id, formData);
      setStudy((current) => ({
        ...current,
        documents: result.data.study.documents,
        activity: result.data.study.activity,
      }));
      input.value = '';
      push({ tone: 'success', message: 'Documents saved.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  function onUpload(event) {
    return uploadDocuments(event, uploadType);
  }

  function onSolutionUpload(event) {
    return uploadDocuments(event, solutionUploadType);
  }

  async function onView(document) {
    try {
      const blob = await viewStudyDocument(study.id, document);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function onDownload(document) {
    try {
      await downloadStudyDocument(study.id, document);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy('delete');
    try {
      const result = await deleteStudyDocument(study.id, pendingDelete.id);
      setStudy((current) => ({
        ...current,
        documents: result.data.study.documents,
        activity: result.data.study.activity,
      }));
      setPendingDelete(null);
      push({ tone: 'success', message: 'Document deleted.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  return (
    <PageContainer>
      <StudyHeader
        lead={lead}
        study={study}
        statusInfo={statusInfo}
        dirty={dirty}
        access={access}
        editing={editing}
        busy={busy}
        onBack={() => navigate('/feasibility-studies')}
        onStart={onStart}
        onEdit={beginEdit}
        onCancelEdit={cancelEdit}
        onSave={onSave}
        onSubmit={askSubmit}
        onUploadTab={() => setTab('documents')}
        onApprove={() => onReview('approve')}
        onChanges={() => { setChangesNote(''); setChangesOpen(true); }}
        onReject={() => { setChangesNote(''); setRejectOpen(true); }}
        onProceed={onProceed}
      />
      <SummaryStrip statusInfo={statusInfo} counts={counts} pocLabel={pocInfo.label} />
      <ProgressTrack steps={steps} />

      <div className="feas-tabs" role="tablist" aria-label="Feasibility sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="feas-tab" role="tabpanel">
        {tab === 'overview' ? (
          <div className="feas-stack">
            <OverviewPanel study={view} counts={counts} pocLabel={pocInfo.label} />
            <DocumentsSection
              study={view}
              uploadType={uploadType}
              uploadTeamId={uploadTeamId}
              onUploadType={setUploadType}
              onUploadTeam={setUploadTeamId}
              onUpload={onUpload}
              onView={onView}
              onDownload={onDownload}
              onDelete={setPendingDelete}
              currentUserId={user?.id}
            />
          </div>
        ) : null}
        {tab === 'requirements' ? <RequirementsPanel study={view} onStudy={setStudy} /> : null}
        {tab === 'teams' ? <TeamsWorkspace study={view} users={users} onStudy={setStudy} onSaveTeam={onSaveTeam} onReviewTeam={onReviewTeam} /> : null}
        {tab === 'validation' ? (
          <div className="feas-stack">
            <TechnicalAssessmentSection study={view} onStudy={setStudy} />
            <ValidationPanel study={view} onStudy={setStudy} />
          </div>
        ) : null}
        {tab === 'risks' ? <RisksPanel study={view} users={users} onStudy={setStudy} /> : null}
        {tab === 'documents' ? (
          <DocumentsSection
            study={view}
            uploadType={uploadType}
            uploadTeamId={uploadTeamId}
            onUploadType={setUploadType}
            onUploadTeam={setUploadTeamId}
            onUpload={onUpload}
            onView={onView}
            onDownload={onDownload}
            onDelete={setPendingDelete}
            currentUserId={user?.id}
          />
        ) : null}
        {tab === 'communication' ? <CommunicationSection study={view} onStudy={setStudy} /> : null}
        {tab === 'activity' ? <ActivityPanel activity={study.activity} /> : null}
        {tab === 'solution' ? (
          <FeasibilitySolutionPanel
            study={view}
            users={users}
            onStudy={setStudy}
            onProceed={onProceed}
            onSave={onSave}
            onSubmit={askSubmit}
            onApprove={() => onReview('approve')}
            onChanges={() => { setChangesNote(''); setChangesOpen(true); }}
            onReject={() => { setChangesNote(''); setRejectOpen(true); }}
            uploadType={solutionUploadType}
            uploadTeamId={uploadTeamId}
            onUploadType={setSolutionUploadType}
            onUploadTeam={setUploadTeamId}
            onUpload={onSolutionUpload}
            onView={onView}
            onDownload={onDownload}
            onDelete={setPendingDelete}
            currentUserId={user?.id}
            busy={busy}
            dirty={dirty}
            editing={editing}
          />
        ) : null}
      </div>

      <Modal open={submitOpen} title="Submit to PM?" onClose={() => setSubmitOpen(false)}>
        <div className="lead-confirm">
          <dl>
            <div><dt>Lead ID</dt><dd>{lead.leadCode || '—'}</dd></div>
            <div><dt>Customer</dt><dd>{lead.customerName || '—'}</dd></div>
            <div><dt>Project</dt><dd>{lead.title || '—'}</dd></div>
            <div><dt>Assigned teams</dt><dd>{(study.teams || []).map((team) => team.teamName).join(', ') || 'None'}</dd></div>
            <div><dt>Assessment completion</dt><dd>{counts.teamsComplete}/{counts.teamCount || 0} teams · {progress.teamInputs}%</dd></div>
            <div><dt>Documents</dt><dd>{counts.documentCount}</dd></div>
            <div><dt>Feasibility decision</dt><dd>{statusMeta(FEASIBILITY_STATUSES, study.decision).label}</dd></div>
            <div><dt>Pending critical inputs</dt><dd>{counts.pendingCriticalInputs}</dd></div>
            <div><dt>Open critical risks</dt><dd>{counts.openCriticalRisks}</dd></div>
            <div><dt>POC / validation</dt><dd>{pocInfo.label}</dd></div>
          </dl>
          {(counts.pendingCriticalInputs > 0 || counts.openCriticalRisks > 0) ? (
            <p className="feas-note">Outstanding items above will still be visible to the PM. Resolve critical blockers if this decision is Feasible.</p>
          ) : null}
          <p>Submission locks the feasibility solution for PM review, records history, and notifies project managers.</p>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={onSubmit} loading={busy === 'submit'}>{study.submittedAt ? 'Resubmit to PM' : 'Submit to PM'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={proceedOpen} title="Proceed with conditions?" onClose={() => setProceedOpen(false)}>
        <div className="lead-confirm">
          <p>Solution and costing can continue only with these conditions:</p>
          <strong>{study.conditions}</strong>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setProceedOpen(false)}>Cancel</Button>
            <Button onClick={onProceed} loading={busy === 'proceed'}>Proceed to solution and costing</Button>
          </div>
        </div>
      </Modal>

      <Modal open={changesOpen} title="Request rework?" onClose={() => setChangesOpen(false)}>
        <div className="lead-confirm">
          <label className="field" htmlFor="changes-note">
            <span className="field__label">Rework comments</span>
            <textarea id="changes-note" className="textarea" rows={3} value={changesNote} onChange={(event) => setChangesNote(event.target.value)} />
          </label>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setChangesOpen(false)}>Cancel</Button>
            <Button onClick={() => onReview('changes')} loading={busy === 'changes'}>Request rework</Button>
          </div>
        </div>
      </Modal>

      <Modal open={rejectOpen} title="Reject feasibility study?" onClose={() => setRejectOpen(false)}>
        <div className="lead-confirm">
          <label className="field" htmlFor="reject-note">
            <span className="field__label">Rejection reason</span>
            <textarea id="reject-note" className="textarea" rows={3} value={changesNote} onChange={(event) => setChangesNote(event.target.value)} />
          </label>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => onReview('reject')} loading={busy === 'reject'}>Reject</Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(pendingDelete)} title="Delete document?" onClose={() => setPendingDelete(null)}>
        <div className="lead-confirm">
          <p>Delete {pendingDelete?.name} from this feasibility study?</p>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy === 'delete'}>Delete</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
