import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, Pencil, Send, Trash2 } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Loader } from '../../components/ui/Loader';
import { Modal } from '../../components/ui/Modal';
import { UserSelector } from '../../components/common/UserSelector';
import { canEditLead, canSubmitLead, leadStatusMeta, TECHNICAL_FIELDS, WORKFLOW_STEPS, workflowStep } from '../../components/leads/leadModel';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { assignLeadTeam, createQuotation, deleteLead, downloadLeadDocument, getLead, recordNegotiation, respondToAssignment, reviewLead, sendQuotation, submitLead } from '../../services/leads.service';
import { listTeams } from '../../services/teams.service';
import { displayValue, formatDate, formatDateTime } from '../../utils/format';
import '../../styles/lead.css';

function SummaryItem({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || 'Not set'}</dd>
    </div>
  );
}

function ReadSection({ title, children }) {
  return (
    <section className="lead-section">
      <header className="lead-section__header"><h2>{title}</h2></header>
      <dl className="lead-read">{children}</dl>
    </section>
  );
}

export default function LeadDetailPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [lead, setLead] = useState(null);
  const [status, setStatus] = useState('loading');
  const [fullOpen, setFullOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [teams, setTeams] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [teamLeadId, setTeamLeadId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [quote, setQuote] = useState({ scope: '', price: '', validity: '', paymentTerms: '' });
  useDocumentTitle(lead ? `${lead.leadCode} · Lead` : 'Lead');

  const load = useCallback(() => {
    setStatus('loading');
    return getLead(leadId)
      .then((payload) => {
        setLead(payload.data.lead);
        setNote(payload.data.lead.pmNote || '');
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [leadId, push]);

  useEffect(() => {
    load();
    listTeams().then((payload) => setTeams(payload.data?.teams || [])).catch(() => setTeams([]));
  }, [load]);

  async function onReview(action) {
    setBusy(action);
    try {
      const result = await reviewLead(lead.id, { action, note });
      setLead(result.data.lead);
      push({ tone: 'success', message: 'Project manager review recorded.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    setBusy('delete');
    try {
      await deleteLead(lead.id);
      push({ tone: 'success', message: `${lead.leadCode} deleted.` });
      navigate('/lead-pipeline');
    } catch (error) {
      push({ tone: 'danger', message: error.message });
      setBusy(null);
    }
  }

  async function onSubmit() {
    setBusy('submit');
    try {
      const result = await submitLead(lead.id);
      setLead(result.data.lead);
      setConfirmSubmit(false);
      push({ tone: 'success', message: 'Lead submitted to the project manager.' });
    } catch (error) {
      setConfirmSubmit(false);
      const fields = error.details?.fields;
      if (fields) {
        push({ tone: 'warning', message: Object.values(fields)[0] });
        navigate(`/lead-pipeline/${lead.id}/edit`, { state: { errors: fields } });
      } else {
        push({ tone: 'danger', message: error.message });
      }
      setBusy(null);
    }
  }

  if (status === 'loading') return <Loader label="Loading lead" />;
  if (status === 'error' || !lead) {
    return (
      <PageContainer>
        <ErrorState title="This lead could not be loaded." action={<Button onClick={() => navigate('/lead-pipeline')}>Back to pipeline</Button>} />
      </PageContainer>
    );
  }

  const statusMeta = leadStatusMeta(lead.status);
  const details = lead.details || {};

  return (
    <PageContainer>
      <header className="lead-detail-header">
        <div>
          <p className="lead-code">{lead.leadCode}</p>
          <h1>{lead.title || 'Untitled lead'}</h1>
          <div className="lead-detail-header__meta">
            <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
            <span>{lead.stage}</span>
            {lead.submittedToPmAt && !canSubmitLead(lead.status) ? (
              <span>Submitted to PM · {formatDateTime(lead.submittedToPmAt)}</span>
            ) : null}
          </div>
        </div>
        <div className="lead-detail-header__actions">
          {lead.access?.canEdit && canEditLead(lead.status) ? (
            <Button variant="secondary" onClick={() => navigate(`/lead-pipeline/${lead.id}/edit`)}>
              <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
              Edit
            </Button>
          ) : null}
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            Delete
          </Button>
          {lead.access?.canSubmit && canSubmitLead(lead.status) ? (
            <Button onClick={() => setConfirmSubmit(true)}>
              <Send size={16} strokeWidth={1.75} aria-hidden="true" />
              Submit to PM
            </Button>
          ) : null}
        </div>
      </header>

      {lead.status === 'CHANGES_REQUESTED' ? (
        <section className="lead-banner lead-banner--warning">
          <strong>Changes requested by PM</strong>
          <p>{lead.pmNote || 'Update the lead and submit it again.'}</p>
        </section>
      ) : null}

      <section className="lead-summary">
        <h2>Lead summary</h2>
        <dl className="lead-read">
          <SummaryItem label="Lead ID" value={lead.leadCode} />
          <SummaryItem label="Lead title" value={lead.title} />
          <SummaryItem label="Customer" value={lead.customerName} />
          <SummaryItem label="Business vertical" value={lead.businessVertical} />
          <SummaryItem label="Created by" value={lead.createdBy} />
          <SummaryItem label="Priority" value={lead.priority} />
          <SummaryItem label="Expected decision date" value={formatDate(lead.expectedDecisionDate)} />
        </dl>

        <h2>Customer requirement</h2>
        <p className="lead-prose">{displayValue(lead.customerRequirement || lead.description)}</p>

        <h2>Project / solution</h2>
        <dl className="lead-read">
          <SummaryItem label="Application / use case" value={lead.useCase} />
          <SummaryItem label="Required solution" value={lead.requiredSolution} />
          <SummaryItem label="Production quantity" value={lead.productionQuantity} />
          <SummaryItem label="Estimated project value" value={lead.estimatedValue} />
        </dl>

        <h2>Technical summary</h2>
        <dl className="lead-read">
          <SummaryItem label="Technical requirements" value={lead.technicalRequirements} />
          <SummaryItem label="Customer challenge" value={lead.customerChallenge} />
          <SummaryItem label="Expected automation" value={details.expectedAutomation} />
        </dl>

        <h2>Commercial summary</h2>
        <dl className="lead-read">
          <SummaryItem label="Budget" value={details.budget} />
          <SummaryItem label="Expected PO date" value={details.expectedPoDate} />
          <SummaryItem label="Commercial requirements" value={lead.commercialRequirements} />
        </dl>

        <h2>Customer visit</h2>
        <p className="lead-prose">{lead.visitRequirement}</p>

        <h2>Documents</h2>
        <p className="lead-prose">{lead.documents.length} uploaded {lead.documents.length === 1 ? 'document' : 'documents'}</p>
        <Button variant="secondary" onClick={() => setFullOpen((open) => !open)}>
          {fullOpen ? 'Hide full lead' : 'View full lead'}
        </Button>
      </section>

      {fullOpen ? (
        <>
          <ReadSection title="Lead information">
            <SummaryItem label="Customer type" value={lead.customerType} />
            <SummaryItem label="Stage" value={lead.stage} />
            <SummaryItem label="Created" value={formatDateTime(lead.createdAt)} />
            <SummaryItem label="Last updated" value={formatDateTime(lead.updatedAt)} />
          </ReadSection>
          <ReadSection title="Customer information">
            <SummaryItem label="Contact person" value={lead.contactPerson} />
            <SummaryItem label="Designation" value={lead.designation} />
            <SummaryItem label="Email" value={lead.email} />
            <SummaryItem label="Phone" value={lead.phone} />
            <SummaryItem label="Office location" value={lead.officeLocation} />
            <SummaryItem label="Plant / site" value={lead.siteLocation} />
          </ReadSection>
          <ReadSection title="Project information">
            <SummaryItem label="Project description" value={lead.description} />
            <SummaryItem label="Remarks" value={lead.remarks} />
            <SummaryItem label="Competitor information" value={lead.competitorInfo} />
            {lead.customFields.map((field) => (
              <SummaryItem key={`${field.name}-${field.value}`} label={field.name || 'Additional field'} value={field.value} />
            ))}
          </ReadSection>
          <ReadSection title="Technical information">
            {TECHNICAL_FIELDS.filter(([key]) => !['budget', 'expectedPoDate'].includes(key)).map(([key, label]) => (
              <SummaryItem key={key} label={label} value={details[key]} />
            ))}
          </ReadSection>
          <ReadSection title="Commercial information">
            <SummaryItem label="Estimated project value" value={lead.estimatedValue} />
            <SummaryItem label="Commercial requirements" value={lead.commercialRequirements} />
            <SummaryItem label="Customer budget" value={details.budget} />
            <SummaryItem label="Expected PO date" value={details.expectedPoDate} />
          </ReadSection>
          <section className="lead-section">
            <header className="lead-section__header"><h2>Documents</h2></header>
            {lead.documents.length ? (
              <ul className="lead-files">
                {lead.documents.map((document) => (
                  <li key={document.id}>
                    <span>{document.name}</span>
                    <button
                      type="button"
                      onClick={() => downloadLeadDocument(lead.id, document, document.name).catch((error) => {
                        push({ tone: 'danger', message: error.message });
                      })}
                    >
                      <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="lead-prose">No documents uploaded.</p>}
          </section>
          <ReadSection title="Customer visit">
            <SummaryItem label="Visit requirement" value={lead.visitRequirement} />
          </ReadSection>
        </>
      ) : null}

      <section className="lead-section">
        <header className="lead-section__header"><h2>Activity</h2></header>
        <ol className="lead-timeline">
          {lead.activity.map((item) => (
            <li key={item.id}>
              <strong>{item.action}</strong>
              <span>{item.actor} · {formatDateTime(item.createdAt)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="lead-section">
        <header className="lead-section__header"><h2>Workflow</h2></header>
        <ol className="lead-flow">
          {WORKFLOW_STEPS.map((label, index) => (
            <li key={label} className={index <= workflowStep(lead.status) ? 'is-current' : ''}>{label}</li>
          ))}
        </ol>
        <p className="lead-prose">Source: {lead.source === 'ENGINEERING' ? 'Engineering' : 'Business'} · Created by {lead.createdBy}</p>
        {lead.assignedTeam ? <p className="lead-prose">Assigned to {lead.assignedTeam}{lead.assignedLead ? ` · ${lead.assignedLead}` : ''}</p> : null}
      </section>

      {lead.access?.canReview ? (
        <section className="lead-section">
          <header className="lead-section__header">
            <h2>Project manager review</h2>
            <p>Accept the lead, ask sales to revise it, or place it on hold.</p>
          </header>
          <label className="field" htmlFor="pm-note">
            <span className="field__label">Note for sales</span>
            <textarea id="pm-note" className="textarea" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="lead-actions">
            <Button variant="secondary" loading={busy === 'hold'} disabled={Boolean(busy)} onClick={() => onReview('hold')}>Put on hold</Button>
            <Button variant="secondary" loading={busy === 'changes'} disabled={Boolean(busy)} onClick={() => onReview('changes')}>Request changes</Button>
            <Button variant="secondary" loading={busy === 'reject'} disabled={Boolean(busy)} onClick={() => onReview('reject')}>Reject</Button>
            <Button loading={busy === 'accept'} disabled={Boolean(busy)} onClick={() => onReview('accept')}>Approve for team assignment</Button>
          </div>
        </section>
      ) : null}

      {(lead.teamAssignments || []).length ? (
        <section className="lead-section">
          <header className="lead-section__header">
            <h2>Team assignments</h2>
            <p>Each team accepts or rejects on its own. A rejection returns that team to the project manager.</p>
          </header>
          <div className="lead-incoming__grid">
            {(lead.teamAssignments || []).map((item) => (
              <article key={item.id} className="lead-incoming__card">
                <h3>{item.teamName}</h3>
                <p>{item.teamLeadName ? `Lead: ${item.teamLeadName}` : 'Team lead not set'}</p>
                <Badge tone={item.status === 'ACCEPTED' ? 'completed' : item.status === 'REJECTED' ? 'danger' : 'info'}>{item.status}</Badge>
                {item.rejectionReason ? <p>{item.rejectionReason}</p> : null}
                {(item.canRespond || ((lead.access?.canReview || lead.access?.canAssign) && item.status === 'PENDING')) ? (
                  <div className="lead-actions">
                    <Button size="sm" disabled={Boolean(busy)} onClick={async () => {
                      setBusy(item.id);
                      try {
                        await respondToAssignment(item.id, { action: 'ACCEPT' });
                        push({ tone: 'success', message: `${item.teamName} accepted.` });
                        await load();
                      } catch (error) {
                        push({ tone: 'danger', message: error.message });
                      } finally {
                        setBusy(null);
                      }
                    }}
                    >Accept</Button>
                    <textarea className="textarea" rows={2} value={rejectReason} placeholder="Rejection reason" onChange={(event) => setRejectReason(event.target.value)} />
                    <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={async () => {
                      setBusy(item.id);
                      try {
                        await respondToAssignment(item.id, { action: 'REJECT', reason: rejectReason });
                        setRejectReason('');
                        push({ tone: 'success', message: 'Returned to the project manager.' });
                        await load();
                      } catch (error) {
                        push({ tone: 'danger', message: error.message });
                      } finally {
                        setBusy(null);
                      }
                    }}
                    >Reject</Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {lead.access?.canAssign ? (
        <section className="lead-section">
          <header className="lead-section__header">
            <h2>Assign teams</h2>
            <p>Choose one or more of the five delivery teams. Accepted work opens the same feasibility study for that team.</p>
          </header>
          <div className="team-hub__picks">
            {teams.map((team) => (
              <label key={team.id}>
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.id)}
                  onChange={(event) => {
                    setSelectedTeams((current) => (
                      event.target.checked ? [...current, team.id] : current.filter((id) => id !== team.id)
                    ));
                  }}
                />
                {team.name}
              </label>
            ))}
          </div>
          <div className="lead-actions">
            <UserSelector value={teamLeadId} teamId={selectedTeams[0] || ''} activeOnly onChange={setTeamLeadId} placeholder="Team lead for the first selected team" />
            <textarea className="textarea" rows={2} value={assignmentNotes} placeholder="Assignment notes" onChange={(event) => setAssignmentNotes(event.target.value)} />
            <Button loading={busy === 'assign'} onClick={async () => {
              setBusy('assign');
              try {
                await assignLeadTeam(lead.id, {
                  notes: assignmentNotes,
                  teams: selectedTeams.map((id, index) => ({
                    teamId: id,
                    teamLeadId: index === 0 ? teamLeadId : '',
                  })),
                });
                push({ tone: 'success', message: 'Teams assigned. Members will see the assignment on their dashboard.' });
                await load();
              } catch (error) {
                push({ tone: 'danger', message: error.message });
              } finally {
                setBusy(null);
              }
            }}
            >Assign teams</Button>
          </div>
        </section>
      ) : null}

      {lead.access?.canQuote ? (
        <section className="lead-section">
          <header className="lead-section__header"><h2>Quotation</h2><p>Each version is kept. Negotiation does not overwrite an earlier quotation.</p></header>
          {(lead.quotations || []).map((item) => (
            <p key={item.id} className="lead-prose">V{item.versionNo} · {item.status}{item.price != null ? ` · ${item.price}` : ''}</p>
          ))}
          <div className="lead-actions">
            <input className="input" placeholder="Scope" value={quote.scope} onChange={(event) => setQuote({ ...quote, scope: event.target.value })} />
            <input className="input" placeholder="Price" value={quote.price} onChange={(event) => setQuote({ ...quote, price: event.target.value })} />
            <input className="input" placeholder="Validity" value={quote.validity} onChange={(event) => setQuote({ ...quote, validity: event.target.value })} />
            <input className="input" placeholder="Payment terms" value={quote.paymentTerms} onChange={(event) => setQuote({ ...quote, paymentTerms: event.target.value })} />
            <Button loading={busy === 'quote'} onClick={async () => {
              setBusy('quote');
              try {
                await createQuotation(lead.id, quote);
                push({ tone: 'success', message: 'Quotation version created.' });
                await load();
              } catch (error) {
                push({ tone: 'danger', message: error.message });
              } finally {
                setBusy(null);
              }
            }}
            >Create quotation version</Button>
            {(lead.quotations || []).filter((item) => ['DRAFT', 'READY_TO_SEND', 'INTERNAL_REVIEW'].includes(item.status)).map((item) => (
              <Button key={item.id} variant="secondary" onClick={async () => {
                try {
                  await sendQuotation(item.id);
                  push({ tone: 'success', message: `Quotation V${item.versionNo} sent.` });
                  await load();
                } catch (error) {
                  push({ tone: 'danger', message: error.message });
                }
              }}
              >Send V{item.versionNo}</Button>
            ))}
            {(lead.quotations || []).slice(-1).map((item) => (
              <Button key={`${item.id}-won`} variant="secondary" onClick={async () => {
                try {
                  await recordNegotiation(item.id, { status: 'WON', discussion: 'Customer accepted the quotation.' });
                  push({ tone: 'success', message: 'Lead marked won. It can now be converted to a project.' });
                  await load();
                } catch (error) {
                  push({ tone: 'danger', message: error.message });
                }
              }}
              >Mark won</Button>
            ))}
          </div>
        </section>
      ) : null}

      {['PM_APPROVED', 'FEASIBILITY', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_APPROVED'].includes(lead.status) ? (
        <section className="lead-banner">
          <strong>Approved for feasibility study</strong>
          <p>
            This lead is ready for the next workflow.
            {' '}
            <Link to={`/feasibility-studies/lead/${lead.id}`}>Open feasibility study</Link>
          </p>
        </section>
      ) : null}

      <Modal open={confirmDelete} title="Delete lead?" onClose={() => setConfirmDelete(false)}>
        <div className="lead-confirm">
          <p>Are you sure you want to delete:</p>
          <strong>{lead.leadCode} — {lead.title || 'Untitled lead'}</strong>
          <p>This action cannot be undone.</p>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" loading={busy === 'delete'} onClick={onDelete}>Delete lead</Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmSubmit} title="Submit lead to project manager?" onClose={() => setConfirmSubmit(false)}>
        <div className="lead-confirm">
          <dl>
            <SummaryItem label="Lead" value={lead.leadCode} />
            <SummaryItem label="Customer" value={lead.customerName} />
            <SummaryItem label="Project" value={lead.title} />
            <SummaryItem label="Priority" value={lead.priority} />
            <SummaryItem label="Expected decision" value={formatDate(lead.expectedDecisionDate)} />
          </dl>
          <p>Once submitted, this lead will be sent to the project manager for review.</p>
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>Cancel</Button>
            <Button loading={busy === 'submit'} onClick={onSubmit}>Submit to PM</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
