import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LeadForm } from '../../components/leads/LeadForm';
import { canEditLead, submitFieldErrors, toLeadPayload } from '../../components/leads/leadModel';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { Loader } from '../../components/ui/Loader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { ApiError } from '../../services/api';
import { createLead, getLead, listLeads, submitLead, updateLead, uploadLeadDocuments } from '../../services/leads.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';

async function persistLead(current, values, files) {
  const payload = toLeadPayload(values);
  const saved = current
    ? await updateLead(current.id, payload)
    : await createLead(payload);
  let lead = saved.data.lead;
  if (files.length) {
    const uploaded = await uploadLeadDocuments(lead.id, files);
    lead = uploaded.data.lead;
  }
  return lead;
}

export default function LeadFormPage({ mode }) {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { leadId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const [lead, setLead] = useState(null);
  const [canCreate, setCanCreate] = useState(mode !== 'create');
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState(location.state?.errors || {});
  const [pendingSubmit, setPendingSubmit] = useState(null);

  useEffect(() => {
    let active = true;
    if (mode === 'create') {
      setStatus('loading');
      listLeads()
        .then((payload) => {
          if (!active) return;
          const allowed = Boolean(payload.data.access?.canCreate);
          setCanCreate(allowed);
          setStatus(allowed ? 'ready' : 'forbidden');
        })
        .catch((error) => {
          if (!active) return;
          setStatus('error');
          push({ tone: 'danger', message: error.message });
        });
      return () => { active = false; };
    }
    setStatus('loading');
    getLead(leadId)
      .then((payload) => {
        if (active) {
          setLead(payload.data.lead);
          setStatus('ready');
        }
      })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
    return () => {
      active = false;
    };
  }, [leadId, mode, push]);

  async function onSaveDraft(values, files, clearFiles) {
    setBusy('save');
    setErrors({});
    try {
      const saved = await persistLead(lead, values, files);
      clearFiles();
      push({
        tone: 'success',
        message: lead?.status === 'CHANGES_REQUESTED' ? 'Changes saved.' : 'Draft saved successfully.',
      });
      if (mode === 'create') {
        navigate(`/lead-pipeline/${saved.id}/edit`, { replace: true });
      } else {
        setLead(saved);
      }
    } catch (error) {
      push({ tone: 'danger', message: error instanceof ApiError ? error.message : 'The draft could not be saved.' });
    } finally {
      setBusy(null);
    }
  }

  async function onSubmit(values, files, clearFiles) {
    const fieldErrors = submitFieldErrors(values);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      push({ tone: 'warning', message: Object.values(fieldErrors)[0] });
      return;
    }
    setBusy('submit');
    try {
      const saved = await persistLead(lead, values, files);
      clearFiles();
      setLead(saved);
      setPendingSubmit({
        id: saved.id,
        leadCode: saved.leadCode,
        values,
      });
    } catch (error) {
      push({ tone: 'danger', message: error instanceof ApiError ? error.message : 'The lead could not be saved.' });
    } finally {
      setBusy(null);
    }
  }

  function closeSubmit() {
    const savedId = pendingSubmit?.id;
    setPendingSubmit(null);
    if (mode === 'create' && savedId) {
      navigate(`/lead-pipeline/${savedId}/edit`, { replace: true });
    }
  }

  async function confirmSubmit() {
    if (!pendingSubmit) return;
    const request = pendingSubmit;
    setPendingSubmit(null);
    setBusy('submit');
    try {
      const submitted = await submitLead(request.id);
      push({ tone: 'success', message: 'Lead submitted to the project manager.' });
      navigate(`/lead-pipeline/${submitted.data.lead.id}`);
    } catch (error) {
      const fieldErrors = error.details?.fields || {};
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      push({ tone: 'danger', message: error.message || 'The lead could not be submitted.' });
      if (mode === 'create') {
        navigate(`/lead-pipeline/${request.id}/edit`, { replace: true, state: { errors: fieldErrors } });
      }
    } finally {
      setBusy(null);
    }
  }

  if (status === 'loading') return <Loader label="Loading lead" />;
  if (status === 'forbidden' || (mode === 'create' && !canCreate)) {
    return (
      <PageContainer>
        <ErrorState
          title="Only the Business Head or Engineering Director can create a lead."
          action={<Button onClick={() => navigate('/lead-pipeline')}>Back to pipeline</Button>}
        />
      </PageContainer>
    );
  }
  if (status === 'error') {
    return (
      <PageContainer>
        <ErrorState title="This lead could not be loaded." action={<Button onClick={() => navigate('/lead-pipeline')}>Back to pipeline</Button>} />
      </PageContainer>
    );
  }
  if (lead && !canEditLead(lead.status)) {
    return <Navigate to={`/lead-pipeline/${lead.id}`} replace />;
  }

  const summary = pendingSubmit?.values;

  return (
    <PageContainer>
      <PageHeader
        title={mode === 'create' ? 'Create lead' : (lead?.leadCode || 'Edit lead')}
        description={mode === 'create'
          ? 'Save a draft at any time. Required fields are checked only when you submit to the project manager.'
          : 'Update the draft, then submit it to the project manager when the required details are complete.'}
      />
      {lead?.status === 'CHANGES_REQUESTED' ? (
        <section className="lead-banner lead-banner--warning">
          <strong>Changes requested by PM</strong>
          <p>{lead.pmNote || 'Update the lead and submit it to the project manager again.'}</p>
        </section>
      ) : null}
      <LeadForm
        key={lead?.id || 'new'}
        mode={mode}
        lead={lead}
        actorName={user?.fullName || ''}
        busy={busy}
        errors={errors}
        onSaveDraft={onSaveDraft}
        onSubmit={onSubmit}
      />
      <Modal open={Boolean(summary)} title="Submit lead to project manager?" onClose={closeSubmit}>
        {summary ? (
          <div className="lead-confirm">
            <dl>
              <div><dt>Lead</dt><dd>{pendingSubmit.leadCode}</dd></div>
              <div><dt>Customer</dt><dd>{summary.customerName}</dd></div>
              <div><dt>Project</dt><dd>{summary.title}</dd></div>
              <div><dt>Priority</dt><dd>{summary.priority}</dd></div>
              <div><dt>Expected decision</dt><dd>{formatDate(summary.expectedDecisionDate)}</dd></div>
            </dl>
            <p>Once submitted, this lead will be sent to the project manager for review.</p>
            <div className="lead-confirm__actions">
              <Button variant="secondary" onClick={closeSubmit}>Cancel</Button>
              <Button onClick={confirmSubmit}>Submit to PM</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
