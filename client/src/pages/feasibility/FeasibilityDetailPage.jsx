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
} from '../../components/feasibility/FeasibilitySections';
import {
  ActivityPanel,
  ConclusionPanel,
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
  const [changesNote, setChangesNote] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [uploadType, setUploadType] = useState('Other');
  const [uploadTeamId, setUploadTeamId] = useState('');

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

  const view = { ...study, directory: users };
  const access = study.access || {};
  const progress = calculateProgress(study);
  const counts = summarize(study);
  const statusInfo = statusMeta(FEASIBILITY_STATUSES, study.status);
  const pocInfo = statusMeta(TEST_STATUSES, counts.pocStatus);
  const dirty = snapshot(study) !== savedKey;
  const steps = workflowSteps(study);
  const lead = study.lead || {};

  async function onSave() {
    setBusy('save');
    try {
      const result = await saveStudy(study.id, study);
      apply(result.data.study);
      push({ tone: 'success', message: 'Draft saved.' });
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
      push({ tone: 'success', message: 'Feasibility study started.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  function askSubmit() {
    const issues = submitIssues(study);
    const message = Object.values(issues)[0];
    if (message) {
      push({ tone: 'warning', message });
      setTab(issues.teams ? 'teams' : issues.customerInputs ? 'risks' : 'review');
      return;
    }
    setSubmitOpen(true);
  }

  async function onSubmit() {
    setBusy('submit');
    try {
      const result = await submitStudy(study.id, study);
      apply(result.data.study);
      setSubmitOpen(false);
      push({ tone: 'success', message: 'Feasibility submitted to the project manager.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function onReview(action) {
    setBusy(action);
    try {
      const result = await reviewStudy(study.id, { action, note: changesNote });
      apply(result.data.study);
      setChangesOpen(false);
      push({ tone: 'success', message: action === 'approve' ? 'Feasibility approved.' : 'Changes requested.' });
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

  async function onUpload(event) {
    event.preventDefault();
    const input = event.currentTarget.querySelector('input[type="file"]');
    if (!input?.files?.length) {
      push({ tone: 'warning', message: 'Choose a file to upload.' });
      return;
    }
    const formData = new FormData();
    formData.append('documentType', uploadType);
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
        busy={busy}
        onBack={() => navigate('/feasibility-studies')}
        onStart={onStart}
        onSave={onSave}
        onSubmit={askSubmit}
        onApprove={() => onReview('approve')}
        onChanges={() => setChangesOpen(true)}
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
        {tab === 'overview' ? <OverviewPanel study={view} counts={counts} pocLabel={pocInfo.label} /> : null}
        {tab === 'requirements' ? <RequirementsPanel study={view} onStudy={setStudy} /> : null}
        {tab === 'teams' ? <TeamsWorkspace study={view} users={users} onStudy={setStudy} onSaveTeam={onSaveTeam} onReviewTeam={onReviewTeam} /> : null}
        {tab === 'validation' ? <ValidationPanel study={view} onStudy={setStudy} /> : null}
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
        {tab === 'review' ? <ConclusionPanel study={view} users={users} onStudy={setStudy} onProceed={onProceed} /> : null}
      </div>

      <Modal open={submitOpen} title="Submit feasibility to project manager?" onClose={() => setSubmitOpen(false)}>
        <div className="lead-confirm">
          <dl>
            <div><dt>Status</dt><dd>{statusInfo.label}</dd></div>
            <div><dt>Team inputs</dt><dd>{progress.teamInputs}%</dd></div>
            <div><dt>Pending critical inputs</dt><dd>{counts.pendingCriticalInputs}</dd></div>
            <div><dt>Open critical risks</dt><dd>{counts.openCriticalRisks}</dd></div>
            <div><dt>POC</dt><dd>{pocInfo.label}</dd></div>
            <div><dt>Decision</dt><dd>{statusMeta(FEASIBILITY_STATUSES, study.decision).label}</dd></div>
          </dl>
          <p>Once submitted, this feasibility study will be sent to the project manager for review.</p>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button onClick={onSubmit} loading={busy === 'submit'}>Submit to PM</Button>
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

      <Modal open={changesOpen} title="Request changes?" onClose={() => setChangesOpen(false)}>
        <div className="lead-confirm">
          <label className="field" htmlFor="changes-note">
            <span className="field__label">Note</span>
            <textarea id="changes-note" className="textarea" rows={3} value={changesNote} onChange={(event) => setChangesNote(event.target.value)} />
          </label>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setChangesOpen(false)}>Cancel</Button>
            <Button onClick={() => onReview('changes')} loading={busy === 'changes'}>Request changes</Button>
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
