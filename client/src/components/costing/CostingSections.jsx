import { useState } from 'react';
import { Section, TextArea } from '../feasibility/fields';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import {
  BOM_CATEGORIES,
  COMPONENT_CATEGORIES,
  DOCUMENT_TYPES,
  PURCHASE_STATUSES,
  SECTION_LABELS,
  TEAM_LABELS,
  bomLineTotal,
  emptyBomRow,
  formatMoney,
  lineCost,
  statusMeta,
} from './costingModel';
import { formatDateTime } from '../../utils/format';

function Read({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}

export function CommercialCard({ quote, currency }) {
  const lines = [
    ['Material cost', quote.material],
    ['Engineering cost', quote.engineering],
    ['Fabrication cost', quote.sections.fabrication],
    ['Software cost', quote.sections.software],
    ['Installation cost', quote.sections.installation],
    ['Testing / POC cost', quote.sections.testing],
    ['Other cost', quote.sections.other],
    ['Contingency', quote.contingency],
    ['Overhead', quote.overhead],
  ];
  return (
    <aside className="cost-card">
      <h2>Commercial summary</h2>
      <p>{currency} · overhead on {quote.overheadBase === 'DIRECT' ? 'direct cost' : 'subtotal'}</p>
      {lines.map(([label, value]) => (
        <div className="cost-line" key={label}><span>{label}</span><span>{formatMoney(value, currency)}</span></div>
      ))}
      <div className="cost-total"><span>Total internal cost</span><strong>{formatMoney(quote.totalInternal, currency)}</strong></div>
      <div className="cost-line"><span>Margin {quote.marginPercent}%</span><span>{formatMoney(quote.margin, currency)}</span></div>
      <div className="cost-total cost-total--quote"><span>Selling price</span><strong>{formatMoney(quote.selling, currency)}</strong></div>
      <div className="cost-line"><span>Tax / GST {quote.taxPercent}%</span><span>{formatMoney(quote.tax, currency)}</span></div>
      <div className="cost-total cost-total--final"><span>Final quotation value</span><strong>{formatMoney(quote.finalQuote, currency)}</strong></div>
      <div className="cost-formula">
        Direct cost {formatMoney(quote.direct, currency)} + engineering and other {formatMoney(quote.engineeringOther, currency)} + contingency {formatMoney(quote.contingency, currency)} + overhead {formatMoney(quote.overhead, currency)} = total internal cost.
        Total internal cost + margin = selling price. Selling price + tax = final quotation.
      </div>
    </aside>
  );
}

export function OverviewTab({ costing, draft, quote, onChange, disabled, onOpenFeasibility }) {
  const lead = costing.lead || {};
  const study = costing.feasibility || {};
  const openQuotes = (draft.bom || []).filter((row) => !['QUOTE_RECEIVED', 'ORDERED', 'RECEIVED'].includes(row.purchaseStatus)).length;
  const openRisks = (draft.risks || []).filter((risk) => String(risk.risk || '').trim());
  return (
    <div className="feas-split">
      <Section title="Solution summary" actions={<Button size="sm" variant="secondary" onClick={onOpenFeasibility}>Open feasibility</Button>}>
        <dl className="lead-read">
          <Read label="Customer" value={lead.customerName} />
          <Read label="Lead" value={`${lead.leadCode || ''} ${lead.title || ''}`} />
          <Read label="Application" value={lead.useCase} />
          <Read label="Business vertical" value={lead.businessVertical} />
          <Read label="Customer requirement" value={lead.customerRequirement} />
          <Read label="Technical requirements" value={lead.technicalRequirements} />
          <Read label="Feasibility result" value={statusMeta(study.status).label} />
          <Read label="Feasibility conclusion" value={study.conclusion} />
          <Read label="Conditions" value={study.conditions} />
          <Read label="Proposed solution" value={study.proposedSolution} />
          <Read label="Feasibility owner" value={study.ownerName} />
          <Read label="Solution owner" value={costing.ownerName} />
          <Read label="Project manager" value={lead.projectManager} />
          <Read label="Target date" value={lead.targetDate} />
          <Read label="Estimated timeline" value={study.estimatedTimeline} />
        </dl>
      </Section>
      <div className="feas-stack">
        <Section title="Commercial summary">
          <dl className="lead-read">
            <Read label="Internal cost" value={formatMoney(quote.totalInternal, draft.currency)} />
            <Read label="Selling price" value={formatMoney(quote.selling, draft.currency)} />
            <Read label="Margin" value={`${quote.marginPercent}% · ${formatMoney(quote.margin, draft.currency)}`} />
            <Read label="GST" value={`${quote.taxPercent}% · ${formatMoney(quote.tax, draft.currency)}`} />
            <Read label="Final quotation" value={formatMoney(quote.finalQuote, draft.currency)} />
            <Read label="BOM items" value={String((draft.bom || []).length)} />
            <Read label="Open vendor quotes" value={String(openQuotes)} />
            <Read label="Open risks" value={String(openRisks.length)} />
            <Read label="Cost exposure" value={formatMoney(quote.riskExposure, draft.currency)} />
          </dl>
        </Section>
        <Section title="Quotation owner">
          <p className="feas-note">{costing.ownerName || 'Not assigned'}. The owner is carried from the lead. Only authorized users can prepare or send the quotation.</p>
        </Section>
      </div>
    </div>
  );
}

export function TeamContribution({ draft, onChange, disabled }) {
  return (
    <Section title="Team contribution">
        <table className="data-table">
          <thead><tr><th>Team</th><th>Contribution</th><th>Estimated cost</th><th>Assigned members</th><th>Status</th></tr></thead>
          <tbody>
            {(draft.teams || []).map((team, index) => (
              <tr key={team.teamCode}>
                <td>{TEAM_LABELS[team.teamCode] || team.teamCode}</td>
                <td><input className="input" value={team.contribution} disabled={disabled} onChange={(event) => {
                  const teams = draft.teams.slice();
                  teams[index] = { ...team, contribution: event.target.value };
                  onChange({ ...draft, teams });
                }} /></td>
                <td><input className="input" type="number" min="0" step="0.01" value={team.estimatedCost} disabled={disabled} onChange={(event) => {
                  const teams = draft.teams.slice();
                  teams[index] = { ...team, estimatedCost: event.target.value };
                  onChange({ ...draft, teams });
                }} /></td>
                <td><input className="input" value={team.members} disabled={disabled} onChange={(event) => {
                  const teams = draft.teams.slice();
                  teams[index] = { ...team, members: event.target.value };
                  onChange({ ...draft, teams });
                }} /></td>
                <td><input className="input" value={team.status} disabled={disabled} onChange={(event) => {
                  const teams = draft.teams.slice();
                  teams[index] = { ...team, status: event.target.value };
                  onChange({ ...draft, teams });
                }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(draft.teams || []).length ? <p className="feas-note">No team assessments were carried from the feasibility study.</p> : null}
    </Section>
  );
}

export function DesignTab({ draft, onChange, disabled }) {
  const [editing, setEditing] = useState(false);
  function set(field, value) {
    onChange({ ...draft, [field]: value });
  }
  return (
    <div className="feas-stack">
      <Section title="Solution design" actions={disabled ? null : <Button size="sm" variant="secondary" onClick={() => setEditing((open) => !open)}>{editing ? 'Close editor' : 'Edit solution'}</Button>}>
        {editing ? (
          <div className="feas-grid">
            <Input id="solution-name" label="Solution name" value={draft.solutionName} disabled={disabled} onChange={(event) => set('solutionName', event.target.value)} />
            <TextArea id="solution-description" label="Solution description" rows={3} value={draft.solutionDescription} disabled={disabled} onChange={(value) => set('solutionDescription', value)} />
            <TextArea id="automation" label="Proposed automation concept" rows={3} value={draft.automationConcept} disabled={disabled} onChange={(value) => set('automationConcept', value)} />
            <TextArea id="process-flow" label="Process flow" rows={3} value={draft.processFlow} disabled={disabled} onChange={(value) => set('processFlow', value)} />
            <TextArea id="architecture" label="System architecture" rows={3} value={draft.systemArchitecture} disabled={disabled} onChange={(value) => set('systemArchitecture', value)} />
            <TextArea id="assumptions" label="Key assumptions" rows={3} value={draft.keyAssumptions} disabled={disabled} onChange={(value) => set('keyAssumptions', value)} />
          </div>
        ) : (
          <dl className="lead-read">
            <Read label="Solution name" value={draft.solutionName || 'Not specified'} />
            <Read label="Description" value={draft.solutionDescription || 'Not specified'} />
            <Read label="Automation concept" value={draft.automationConcept || 'Not specified'} />
            <Read label="Process flow" value={draft.processFlow || 'Not specified'} />
            <Read label="Architecture" value={draft.systemArchitecture || 'Not specified'} />
          </dl>
        )}
      </Section>
      <Section title="Solution architecture" description="Input, process, inspection, decision, and output. Drawings can be attached on Documents.">
        <div className="cost-flow" aria-label="Process flow">
          {['architectureInput', 'architectureProcess', 'architectureInspection', 'architectureDecision', 'architectureOutput'].map((field) => (
            <input key={field} className="input" value={draft[field] || ''} disabled={disabled} onChange={(event) => set(field, event.target.value)} />
          ))}
        </div>
      </Section>
      <Section title="Solution components" actions={<Button size="sm" variant="secondary" disabled={disabled} onClick={() => onChange({ ...draft, components: [...(draft.components || []), { category: 'Other', name: '', description: '' }] })}>Add component</Button>}>
        {(draft.components || []).map((row, index) => (
          <div className="lead-grid" key={`${row.category}-${index}`}>
            <Select id={`component-cat-${index}`} label="Category" value={row.category} disabled={disabled} onChange={(event) => {
              const components = draft.components.slice();
              components[index] = { ...row, category: event.target.value };
              onChange({ ...draft, components });
            }}>
              {COMPONENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </Select>
            <Input id={`component-name-${index}`} label="Component" value={row.name} disabled={disabled} onChange={(event) => {
              const components = draft.components.slice();
              components[index] = { ...row, name: event.target.value };
              onChange({ ...draft, components });
            }} />
            <Input id={`component-desc-${index}`} label="Description" value={row.description} disabled={disabled} onChange={(event) => {
              const components = draft.components.slice();
              components[index] = { ...row, description: event.target.value };
              onChange({ ...draft, components });
            }} />
          </div>
        ))}
      </Section>
    </div>
  );
}

export function BomTab({ draft, onChange, canEditBom, canEditProcurement, onImport, onExport }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const locked = !canEditBom;
  const priceLocked = !canEditBom && !canEditProcurement;
  function update(index, patch) {
    const bom = draft.bom.slice();
    bom[index] = { ...bom[index], ...patch, itemNo: index + 1 };
    onChange({ ...draft, bom });
  }
  const categoryTotals = {};
  for (const row of draft.bom || []) {
    categoryTotals[row.category] = (categoryTotals[row.category] || 0) + bomLineTotal(row);
  }
  return (
    <Section
      title="Bill of materials"
      description="Line total is quantity × unit cost. Material cost in the commercial summary uses this total. One currency applies to the whole version."
      actions={(
        <div className="cost-actions">
          <Button size="sm" variant="secondary" onClick={onExport}>Export BOM</Button>
          <Button size="sm" variant="secondary" disabled={locked} onClick={onImport}>Import BOM</Button>
          <Button size="sm" disabled={locked} onClick={() => onChange({ ...draft, bom: [...(draft.bom || []), emptyBomRow((draft.bom || []).length + 1)] })}>Add BOM item</Button>
        </div>
      )}
    >
      <div className="cost-filters">
        <input className="input" placeholder="Search component or supplier" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="select" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {BOM_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
        </select>
      </div>
      {(draft.bom || []).length ? (
      <div className="lead-table-wrap">
        <table className="data-table cost-table">
          <thead>
            <tr>
              <th>Item</th><th>Category</th><th>Component</th><th>Qty</th><th>Unit</th><th>Unit cost</th><th>Total</th><th>Supplier</th><th>Purchase</th>
            </tr>
          </thead>
          <tbody>
            {(draft.bom || []).map((row, index) => ({ row, index })).filter(({ row }) => {
              const text = `${row.component} ${row.supplier} ${row.partNumber} ${row.specification}`.toLowerCase();
              if (query && !text.includes(query.trim().toLowerCase())) return false;
              if (category && row.category !== category) return false;
              return true;
            }).map(({ row, index }) => (
              <tr key={row.id || index}>
                <td>{index + 1}</td>
                <td>
                  <select className="select" value={row.category} disabled={locked} onChange={(event) => update(index, { category: event.target.value })}>
                    {BOM_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </td>
                <td><input className="input" value={row.component} disabled={locked} onChange={(event) => update(index, { component: event.target.value })} /></td>
                <td><input className="input" type="number" min="0" step="0.01" value={row.quantity} disabled={locked} onChange={(event) => update(index, { quantity: event.target.value })} /></td>
                <td><input className="input" value={row.unit} disabled={locked} onChange={(event) => update(index, { unit: event.target.value })} /></td>
                <td><input className="input" type="number" min="0" step="0.01" value={row.unitCost} disabled={priceLocked} onChange={(event) => update(index, { unitCost: event.target.value })} /></td>
                <td>{formatMoney(bomLineTotal(row), draft.currency)}</td>
                <td><input className="input" value={row.supplier} disabled={priceLocked} onChange={(event) => update(index, { supplier: event.target.value })} /></td>
                <td>
                  <select className="select" value={row.purchaseStatus} disabled={priceLocked} onChange={(event) => update(index, { purchaseStatus: event.target.value })}>
                    {PURCHASE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      ) : <p className="feas-empty"><strong>No BOM items added yet.</strong></p>}
      <div className="cost-formula">
        {Object.entries(categoryTotals).map(([name, total]) => `${name} ${formatMoney(total, draft.currency)}`).join(' · ')}
      </div>
    </Section>
  );
}

export function VendorsTab({ draft, onChange, canEditProcurement, canEditBom }) {
  const locked = !canEditProcurement && !canEditBom;
  function update(index, patch) {
    const bom = draft.bom.slice();
    bom[index] = { ...bom[index], ...patch };
    onChange({ ...draft, bom });
  }
  const rows = draft.bom || [];
  return (
    <Section title="Vendor and procurement" description="Quotes stay on the BOM line. There is no separate vendor register.">
      {rows.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Component</th><th>Supplier</th><th>Quote ref</th><th>Quoted cost</th><th>Lead time</th><th>Valid until</th><th>Status</th></tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || index}>
                  <td>{row.component || `Item ${index + 1}`}</td>
                  <td><input className="input" value={row.supplier} disabled={locked} onChange={(event) => update(index, { supplier: event.target.value })} /></td>
                  <td><input className="input" value={row.quotationReference} disabled={locked} onChange={(event) => update(index, { quotationReference: event.target.value })} /></td>
                  <td><input className="input" type="number" min="0" step="0.01" value={row.quotedPrice ?? ''} disabled={locked} onChange={(event) => update(index, { quotedPrice: event.target.value })} /></td>
                  <td><input className="input" value={row.leadTime} disabled={locked} onChange={(event) => update(index, { leadTime: event.target.value })} /></td>
                  <td><input className="input" type="date" value={row.quoteValidity || ''} disabled={locked} onChange={(event) => update(index, { quoteValidity: event.target.value })} /></td>
                  <td>
                    <select className="select" value={row.purchaseStatus} disabled={locked} onChange={(event) => update(index, { purchaseStatus: event.target.value })}>
                      {PURCHASE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="feas-empty"><strong>No vendor quotations added yet.</strong> Add a BOM item first, then record the supplier quote here.</p>}
    </Section>
  );
}

export function CostsTab({ draft, onChange, disabled }) {
  const [openSection, setOpenSection] = useState('');
  const groups = Object.keys(SECTION_LABELS);
  function update(lineKey, patch) {
    onChange({
      ...draft,
      entries: (draft.entries || []).map((entry) => (entry.lineKey === lineKey ? { ...entry, ...patch } : entry)),
    });
  }
  return (
    <div className="feas-stack">
      <Section title="Material cost" description="Calculated from the BOM. It is not edited here.">
        <p>Material cost is the sum of BOM line totals and is included as direct cost.</p>
      </Section>
      {groups.map((section) => {
        const lines = (draft.entries || []).filter((entry) => entry.section === section);
        const total = lines.reduce((sum, entry) => sum + lineCost(entry), 0);
        const open = openSection === section;
        return (
        <Section key={section} title={`${SECTION_LABELS[section]} · ${formatMoney(total, draft.currency)}`} actions={<Button size="sm" variant="secondary" onClick={() => setOpenSection(open ? '' : section)}>{open ? 'Close' : 'Edit'}</Button>}>
          {open ? lines.map((entry) => (
            <div className="lead-grid" key={entry.lineKey}>
              <Input id={`${entry.lineKey}-label`} label="Cost line" value={entry.label} disabled />
              {entry.mode === 'HOURS' ? (
                <>
                  <Input id={`${entry.lineKey}-hours`} label="Hours" type="number" min="0" step="0.01" value={entry.hours} disabled={disabled} onChange={(event) => update(entry.lineKey, { hours: event.target.value })} />
                  <Input id={`${entry.lineKey}-rate`} label="Rate" type="number" min="0" step="0.01" value={entry.rate} disabled={disabled} onChange={(event) => update(entry.lineKey, { rate: event.target.value })} />
                </>
              ) : (
                <Input id={`${entry.lineKey}-amount`} label="Amount" type="number" min="0" step="0.01" value={entry.amount} disabled={disabled} onChange={(event) => update(entry.lineKey, { amount: event.target.value })} />
              )}
              <Input id={`${entry.lineKey}-cost`} label="Cost" value={formatMoney(lineCost(entry), draft.currency)} disabled />
            </div>
          )) : <p className="feas-note">{lines.some((entry) => lineCost(entry) > 0) ? 'Open this section to edit hours or amounts.' : 'No cost entered. Open this section to add hours or an amount.'}</p>}
        </Section>
        );
      })}
    </div>
  );
}

export function CommercialTab({ draft, quote, onChange, disabled }) {
  function set(field, value) {
    onChange({ ...draft, [field]: value });
  }
  return (
    <Section title="Margin, overhead, and tax" description="Rates are stored on this version. Nothing is hardcoded.">
      <div className="lead-grid">
        <Select id="currency" label="Currency" value={draft.currency} disabled={disabled} onChange={(event) => set('currency', event.target.value)}>
          <option value="INR">INR</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </Select>
        <Input id="contingency" label="Contingency %" type="number" min="0" step="0.01" value={draft.contingencyPercent} disabled={disabled} onChange={(event) => set('contingencyPercent', event.target.value)} />
        <Input id="overhead" label="Overhead %" type="number" min="0" step="0.01" value={draft.overheadPercent} disabled={disabled} onChange={(event) => set('overheadPercent', event.target.value)} />
        <Select id="overhead-base" label="Overhead calculated on" value={draft.overheadBase} disabled={disabled} onChange={(event) => set('overheadBase', event.target.value)}>
          <option value="SUBTOTAL">Subtotal</option>
          <option value="DIRECT">Direct cost</option>
        </Select>
        <Input id="margin" label="Target margin %" type="number" min="0" step="0.01" value={draft.marginPercent} disabled={disabled} onChange={(event) => set('marginPercent', event.target.value)} />
        <Input id="tax" label="Tax / GST %" type="number" min="0" step="0.01" value={draft.taxPercent} disabled={disabled} onChange={(event) => set('taxPercent', event.target.value)} />
      </div>
      <div className="cost-formula">
        Subtotal {formatMoney(quote.subtotal, draft.currency)}. Contingency {quote.contingencyPercent}% = {formatMoney(quote.contingency, draft.currency)}.
        Overhead {quote.overheadPercent}% of {quote.overheadBase === 'DIRECT' ? 'direct cost' : 'subtotal'} ({formatMoney(quote.overheadBaseAmount, draft.currency)}) = {formatMoney(quote.overhead, draft.currency)}.
        Margin {quote.marginPercent}% of total internal cost = {formatMoney(quote.margin, draft.currency)}.
      </div>
    </Section>
  );
}

export function ScopeTab({ draft, onChange, disabled }) {
  function set(field, value) {
    onChange({ ...draft, [field]: value });
  }
  const durations = [
    ['componentLeadTime', 'Major component lead time'],
    ['engineeringDuration', 'Engineering duration'],
    ['fabricationDuration', 'Fabrication duration'],
    ['assemblyDuration', 'Assembly duration'],
    ['testingDuration', 'Testing duration'],
    ['installationDuration', 'Installation duration'],
    ['commissioningDuration', 'Commissioning duration'],
    ['estimatedDuration', 'Estimated total project duration'],
  ];
  return (
    <div className="feas-stack">
      <Section title="Scope of supply">
        <TextArea id="careyu-scope" label="CareYu scope" value={draft.careyuScope} disabled={disabled} onChange={(value) => set('careyuScope', value)} />
        <TextArea id="customer-scope" label="Customer scope" value={draft.customerScope} disabled={disabled} onChange={(value) => set('customerScope', value)} />
        <TextArea id="third-scope" label="Third party scope" value={draft.thirdPartyScope} disabled={disabled} onChange={(value) => set('thirdPartyScope', value)} />
        <TextArea id="exclusions" label="Exclusions" value={draft.exclusions} disabled={disabled} onChange={(value) => set('exclusions', value)} />
        <TextArea id="scope-supply" label="Scope of supply" value={draft.scopeOfSupply} disabled={disabled} onChange={(value) => set('scopeOfSupply', value)} />
      </Section>
      <Section title="Assumptions">
        <TextArea id="commercial-assumptions" label="Commercial assumptions" value={draft.commercialAssumptions} disabled={disabled} onChange={(value) => set('commercialAssumptions', value)} />
        <TextArea id="technical-assumptions" label="Technical assumptions" value={draft.technicalAssumptions} disabled={disabled} onChange={(value) => set('technicalAssumptions', value)} />
        <TextArea id="dependencies" label="Customer dependencies" value={draft.customerDependencies} disabled={disabled} onChange={(value) => set('customerDependencies', value)} />
      </Section>
      <Section title="Lead time and duration" description="Estimated total duration is entered directly. Overlapping activities are not added together.">
        <div className="lead-grid">
          {durations.map(([field, label]) => (
            <Input key={field} id={field} label={label} value={draft[field] || ''} disabled={disabled} onChange={(event) => set(field, event.target.value)} />
          ))}
        </div>
      </Section>
    </div>
  );
}

export function RisksTab({ draft, onChange, disabled }) {
  return (
    <Section
      title="Costing risks"
      description="Cost impact is shown as exposure. It is not added into the selling price."
      actions={disabled ? null : <Button size="sm" onClick={() => onChange({ ...draft, risks: [...(draft.risks || []), { risk: '', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: '', costImpact: 0, ownerId: '' }] })}>+ Add risk</Button>}
    >
      <p>Potential cost exposure {formatMoney((draft.risks || []).reduce((sum, risk) => sum + Number(risk.costImpact || 0), 0), draft.currency)}</p>
      {(draft.risks || []).map((risk, index) => (
        <div className="lead-grid" key={risk.id || index}>
          <TextArea id={`risk-${index}`} label="Risk" value={risk.risk} disabled={disabled} onChange={(value) => {
            const risks = draft.risks.slice();
            risks[index] = { ...risk, risk: value };
            onChange({ ...draft, risks });
          }} />
          <Input id={`impact-${index}`} label="Impact" value={risk.impact} disabled={disabled} onChange={(event) => {
            const risks = draft.risks.slice();
            risks[index] = { ...risk, impact: event.target.value };
            onChange({ ...draft, risks });
          }} />
          <Input id={`prob-${index}`} label="Probability" value={risk.probability} disabled={disabled} onChange={(event) => {
            const risks = draft.risks.slice();
            risks[index] = { ...risk, probability: event.target.value };
            onChange({ ...draft, risks });
          }} />
          <TextArea id={`mit-${index}`} label="Mitigation" value={risk.mitigation} disabled={disabled} onChange={(value) => {
            const risks = draft.risks.slice();
            risks[index] = { ...risk, mitigation: value };
            onChange({ ...draft, risks });
          }} />
          <Input id={`cost-impact-${index}`} label="Potential cost impact" type="number" value={risk.costImpact} disabled={disabled} onChange={(event) => {
            const risks = draft.risks.slice();
            risks[index] = { ...risk, costImpact: event.target.value };
            onChange({ ...draft, risks });
          }} />
          <Input id={`owner-${index}`} label="Owner" value={risk.ownerName || ''} disabled />
        </div>
      ))}
      {!(draft.risks || []).length ? <p className="feas-empty"><strong>No costing risks identified.</strong></p> : null}
    </Section>
  );
}

export function DocumentsTab({ draft, canUpload, documentType, onType, onUpload, onDownload, onDelete }) {
  return (
    <Section title="Costing documents" description="Vendor quotes, BOM, drawings, architecture, supplier offers, RFQ, previous quotations, and calculation sheets.">
      {canUpload ? (
        <form className="feas-upload" onSubmit={onUpload}>
          <Select id="cost-doc-type" label="Type" value={documentType} onChange={(event) => onType(event.target.value)}>
            {DOCUMENT_TYPES.map((type) => <option key={type}>{type}</option>)}
          </Select>
          <input className="input" type="file" name="documents" multiple />
          <Button type="submit">Upload</Button>
        </form>
      ) : null}
      <table className="data-table">
        <thead><tr><th>Name</th><th>Type</th><th>Uploaded by</th><th>Date</th><th>Version</th><th /></tr></thead>
        <tbody>
          {(draft.documents || []).map((document) => (
            <tr key={document.id}>
              <td>{document.name}</td>
              <td>{document.documentType}</td>
              <td>{document.uploadedBy}</td>
              <td>{formatDateTime(document.createdAt)}</td>
              <td>{document.linked ? 'From feasibility' : `V${draft.versionNo}`}</td>
              <td>
                <Button size="sm" variant="secondary" onClick={() => onDownload(document)}>Download</Button>
                {canUpload ? <Button size="sm" variant="secondary" onClick={() => onDelete(document.id)}>Delete</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!(draft.documents || []).length ? <p className="feas-empty"><strong>No costing documents uploaded yet.</strong></p> : null}
    </Section>
  );
}

export function QuotationTab({ costing, draft, quote }) {
  const lead = costing.lead || {};
  return (
    <Section title="Quotation summary" description="This summary is the source for a later quotation. Terms stay with this costing version.">
      <dl className="lead-read">
        <Read label="Customer" value={lead.customerName} />
        <Read label="Project" value={lead.title} />
        <Read label="Solution" value={draft.solutionName} />
        <Read label="CareYu scope" value={draft.careyuScope} />
        <Read label="Customer scope" value={draft.customerScope} />
        <Read label="Third party scope" value={draft.thirdPartyScope} />
        <Read label="Exclusions" value={draft.exclusions} />
        <Read label="Total internal cost" value={formatMoney(quote.totalInternal, draft.currency)} />
        <Read label="Margin" value={`${quote.marginPercent}% · ${formatMoney(quote.margin, draft.currency)}`} />
        <Read label="Selling price" value={formatMoney(quote.selling, draft.currency)} />
        <Read label="Taxes" value={formatMoney(quote.tax, draft.currency)} />
        <Read label="Final quotation value" value={formatMoney(quote.finalQuote, draft.currency)} />
        <Read label="Payment terms" value={draft.paymentTerms} />
        <Read label="Delivery terms" value={draft.deliveryTerms} />
        <Read label="Warranty" value={draft.warranty} />
        <Read label="Validity" value={draft.validity} />
        <Read label="Installation terms" value={draft.installationTerms} />
      </dl>
    </Section>
  );
}

export function TermsFields({ draft, onChange, disabled }) {
  function set(field, value) {
    onChange({ ...draft, [field]: value });
  }
  return (
    <Section title="Commercial terms">
      <TextArea id="payment" label="Payment terms" value={draft.paymentTerms} disabled={disabled} onChange={(value) => set('paymentTerms', value)} />
      <TextArea id="delivery" label="Delivery terms" value={draft.deliveryTerms} disabled={disabled} onChange={(value) => set('deliveryTerms', value)} />
      <Input id="warranty" label="Warranty" value={draft.warranty} disabled={disabled} onChange={(event) => set('warranty', event.target.value)} />
      <Input id="validity" label="Validity" value={draft.validity} disabled={disabled} onChange={(event) => set('validity', event.target.value)} />
      <TextArea id="install-terms" label="Installation terms" value={draft.installationTerms} disabled={disabled} onChange={(value) => set('installationTerms', value)} />
    </Section>
  );
}

export function ApprovalTab({ draft }) {
  const meta = statusMeta(draft.status);
  return (
    <Section title="Approval history" description="Earlier decisions stay on this version.">
      <p>Status <Badge tone={meta.tone}>{meta.label}</Badge></p>
      {draft.rejectionReason ? <p>Rejection reason: {draft.rejectionReason}</p> : null}
      <table className="data-table">
        <thead><tr><th>Submitted / reviewed by</th><th>Date</th><th>Decision</th><th>Comments</th></tr></thead>
        <tbody>
          {(draft.approvals || []).map((row) => (
            <tr key={row.id}>
              <td>{row.actor}</td>
              <td>{formatDateTime(row.createdAt)}</td>
              <td>{statusMeta(row.decision).label}</td>
              <td>{row.comments || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!(draft.approvals || []).length ? <p className="feas-note">No approval decisions yet.</p> : null}
    </Section>
  );
}

export function ActivityTab({ activity }) {
  return (
    <Section title="Activity">
      <ol className="lead-timeline">
        {(activity || []).map((item) => (
          <li key={item.id}>
            <strong>{item.action}</strong>
            <span>{item.actor} · {formatDateTime(item.createdAt)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function CompareTable({ versions, currency }) {
  const fields = [
    ['material', 'BOM total'],
    ['engineering', 'Engineering cost'],
    ['sections.installation', 'Installation'],
    ['contingency', 'Contingency'],
    ['overhead', 'Overhead'],
    ['margin', 'Margin'],
    ['selling', 'Selling price'],
  ];
  function read(totals, path) {
    return path.split('.').reduce((value, key) => value?.[key], totals) || 0;
  }
  return (
    <div className="lead-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Item</th>
            {versions.map((version) => <th key={version.id}>V{version.versionNo}</th>)}
          </tr>
        </thead>
        <tbody>
          {fields.map(([path, label]) => (
            <tr key={path}>
              <td>{label}</td>
              {versions.map((version, index) => {
                const value = read(version.totals, path);
                const previous = index ? read(versions[index - 1].totals, path) : value;
                const delta = Math.round((value - previous) * 100) / 100;
                return <td key={version.id}>{formatMoney(value, currency)}{index && delta ? ` (${delta > 0 ? '+' : ''}${formatMoney(delta, currency)})` : ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
