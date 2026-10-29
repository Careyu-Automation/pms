import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { exportInsights, loadInsights } from '../../services/insights.service';
import '../../styles/insights.css';

const PRESETS = [
  ['today', 'Today'],
  ['week', 'This Week'],
  ['month', 'This Month'],
  ['lastMonth', 'Last Month'],
  ['last3', 'Last 3 Months'],
  ['quarter', 'This Quarter'],
  ['year', 'This Year'],
  ['custom', 'Custom Range'],
];
const STATUS_LABEL = {
  NOT_STARTED: 'Not started',
  PLANNING: 'Planning',
  IN_PROGRESS: 'Active',
  AT_RISK: 'Delayed',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

function show(value, suffix = '') {
  if (value == null || value === '') return 'No data';
  return `${value}${suffix}`;
}

function Bars({ rows, labelKey = 'label', valueKey = 'value' }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey]) || 0));
  if (!rows.length) return <p className="ins-empty">No data available</p>;
  return (
    <div className="ins-bars">
      {rows.map((row) => (
        <div key={row[labelKey]} className="ins-bar">
          <span>{row[labelKey]}</span>
          <div><i style={{ width: `${((Number(row[valueKey]) || 0) / max) * 100}%` }} /></div>
          <strong>{row[valueKey] ?? 0}</strong>
        </div>
      ))}
    </div>
  );
}

function Block({ title, action, error, children }) {
  return (
    <section className="ins-card">
      <header>
        <h2>{title}</h2>
        {action}
      </header>
      {error ? <p className="ins-error">Unable to load this insight</p> : children}
    </section>
  );
}

export default function InsightsPage() {
  useDocumentTitle('Insights');
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [preset, setPreset] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [filters, setFilters] = useState({ teamId: '', projectId: '', managerId: '', customer: '', status: '' });
  const [trend, setTrend] = useState('30');
  const [metric, setMetric] = useState('completion');
  const [exporting, setExporting] = useState('');

  function params() {
    return {
      preset,
      from: preset === 'custom' ? custom.from : '',
      to: preset === 'custom' ? custom.to : '',
      trend,
      ...filters,
    };
  }

  function load() {
    setStatus('loading');
    return loadInsights(params())
      .then((payload) => {
        setData(payload.data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }

  useEffect(() => { load(); }, [preset, custom.from, custom.to, filters.teamId, filters.projectId, filters.managerId, filters.customer, filters.status, trend]);

  async function download(format) {
    setExporting(format);
    try { await exportInsights(params(), format); } finally { setExporting(''); }
  }

  const options = data?.filters?.teams ? data.filters : { teams: [], projects: [], managers: [], customers: [] };
  const kpis = data?.kpis || {};
  const projects = data?.projects?.error ? null : data?.projects;
  const tasks = data?.tasks?.error ? null : data?.tasks;
  const teams = Array.isArray(data?.teams) ? data.teams : null;
  const overdue = data?.overdue?.error ? null : data?.overdue;
  const overdueRows = overdue ? [...overdue.tasks, ...overdue.projects, ...overdue.escalations] : [];

  return (
    <PageContainer>
      <PageHeader
        title="Insights"
        description="Management insights and performance analytics across projects, teams and operations."
        actions={(
          <div className="ins-actions">
            <select className="select" aria-label="Date range" value={preset} onChange={(event) => setPreset(event.target.value)}>
              {PRESETS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <select className="select" aria-label="Export" value={exporting} onChange={(event) => event.target.value && download(event.target.value)}>
              <option value="">Export</option>
              <option value="xls">Excel</option>
              <option value="csv">CSV</option>
              <option value="pdf">PDF</option>
            </select>
            <Button variant="secondary" onClick={load}>Refresh</Button>
          </div>
        )}
      />

      <div className="ins-filters">
        {preset === 'custom' ? (
          <>
            <input className="input" type="date" aria-label="From" value={custom.from} onChange={(event) => setCustom({ ...custom, from: event.target.value })} />
            <input className="input" type="date" aria-label="To" value={custom.to} onChange={(event) => setCustom({ ...custom, to: event.target.value })} />
          </>
        ) : null}
        <select className="select" aria-label="Team" value={filters.teamId} onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}>
          <option value="">All teams</option>
          {options.teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" aria-label="Project" value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}>
          <option value="">All projects</option>
          {options.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" aria-label="Project manager" value={filters.managerId} onChange={(event) => setFilters({ ...filters, managerId: event.target.value })}>
          <option value="">All managers</option>
          {options.managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" aria-label="Customer" value={filters.customer} onChange={(event) => setFilters({ ...filters, customer: event.target.value })}>
          <option value="">All customers</option>
          {options.customers.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
        <select className="select" aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      {status === 'loading' ? (
        <div className="ins-skeleton" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
      ) : null}
      {status === 'error' ? (
        <section className="ins-card">
          <p className="ins-error">Unable to load this insight</p>
          <Button onClick={load}>Retry</Button>
        </section>
      ) : null}

      {status === 'ready' && data ? (
        <>
          <section className="ins-summary">
            <h2>Management Summary</h2>
            {data.summary.length ? <ul>{data.summary.map((line) => <li key={line}>{line}</li>)}</ul> : <p className="ins-empty">No data available</p>}
          </section>
          <section className="ins-cards">
            {data.cards.map((card) => (
              <article key={card.label}>
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.comparison?.label || 'No comparison data'}</small>
              </article>
            ))}
          </section>
          <section className="ins-kpis">
            {[
              ['Total Projects', show(kpis.totalProjects), '/projects'],
              ['Active Projects', show(kpis.activeProjects), '/projects'],
              ['Completed', show(kpis.completedProjects), '/projects'],
              ['Overdue', show(kpis.overdueTasks), '/tasks'],
              ['Open Escalations', show(kpis.openEscalations), '/escalations?quick=open'],
              ['Lead Pipeline', show(kpis.leads), '/lead-pipeline'],
              ['Utilization', show(kpis.utilization, kpis.utilization == null ? '' : '%'), ''],
              ['On-Time Delivery', show(kpis.onTime, kpis.onTime == null ? '' : '%'), '/tasks'],
            ].map(([label, value, href]) => (
              href
                ? <Link key={label} to={href}><span>{label}</span><strong>{value}</strong></Link>
                : <span key={label}><span>{label}</span><strong>{value}</strong></span>
            ))}
          </section>

          <div className="ins-grid">
            <Block title="Project Performance" error={!projects}>
              {projects ? (
                <Bars rows={[
                  { label: 'Active', value: projects.inProgress, href: '/projects' },
                  { label: 'Planning', value: projects.planning },
                  { label: 'Completed', value: projects.completed },
                  { label: 'On Hold', value: projects.onHold },
                  { label: 'Delayed', value: projects.delayed },
                  { label: 'Overdue', value: projects.overdue },
                  { label: 'Cancelled', value: projects.cancelled },
                ]} />
              ) : <Button onClick={load}>Retry</Button>}
            </Block>
            <Block title="Task Performance" error={!tasks} action={<Link to="/tasks">View tasks</Link>}>
              {tasks ? (
                <>
                  <div className="ins-metrics">
                    <span>Total <strong>{tasks.total}</strong></span>
                    <span>Completed <strong>{tasks.completed}</strong></span>
                    <span>In progress <strong>{tasks.inProgress}</strong></span>
                    <span>Pending <strong>{tasks.pending}</strong></span>
                    <span>Overdue <strong>{tasks.overdue}</strong></span>
                  </div>
                  <p>Completion {show(tasks.completion, tasks.completion == null ? '' : '%')} · On time {show(tasks.onTime, tasks.onTime == null ? '' : '%')} · Average {tasks.averageDays == null ? 'No data' : `${tasks.averageDays} days`}</p>
                  <div className="ins-trend">
                    {['7', '30', '90'].map((days) => <button key={days} type="button" className={trend === days ? 'is-active' : ''} onClick={() => setTrend(days)}>{days} days</button>)}
                  </div>
                  <Bars rows={(tasks.trend || []).filter((_, index, list) => index % Math.ceil(list.length / 12) === 0).map((row) => ({ label: row.date.slice(5), value: row.completed }))} />
                </>
              ) : <Button onClick={load}>Retry</Button>}
            </Block>
          </div>

          <Block title="Project Progress Overview" error={!Array.isArray(data.progress)}>
            {Array.isArray(data.progress) && data.progress.length ? (
              <div className="ins-table-wrap">
                <table>
                  <thead><tr><th>Project</th><th>Customer</th><th>Project Manager</th><th>Progress</th><th>Status</th><th>Deadline</th><th>Risk</th><th>Days Remaining</th></tr></thead>
                  <tbody>
                    {data.progress.map((row) => (
                      <tr key={row.id}>
                        <td><Link to={row.href}>{row.title}</Link></td>
                        <td>{row.customer || '—'}</td>
                        <td>{row.manager || '—'}</td>
                        <td>{row.progress}%</td>
                        <td>{STATUS_LABEL[row.status] || row.status}</td>
                        <td>{row.deadline || '—'}</td>
                        <td>{row.risk}</td>
                        <td>{row.daysRemaining == null ? '—' : row.daysRemaining}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="ins-empty">No data available</p>}
          </Block>

          <Block title="Overdue Work" error={!overdue} action={<Link to="/tasks">View tasks</Link>}>
            {overdueRows.length ? (
              <div className="ins-table-wrap">
                <table>
                  <thead><tr><th>Type</th><th>Item</th><th>Project</th><th>Owner</th><th>Team</th><th>Due</th><th>Days overdue</th><th>Priority</th></tr></thead>
                  <tbody>
                    {overdueRows.map((row) => (
                      <tr key={`${row.kind}-${row.id}`}>
                        <td>{row.kind}</td>
                        <td><Link to={row.href}>{row.title}</Link></td>
                        <td>{row.project || '—'}</td>
                        <td>{row.owner || '—'}</td>
                        <td>{row.team || '—'}</td>
                        <td>{row.due || '—'}</td>
                        <td>{row.days}</td>
                        <td>{row.priority || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="ins-empty">No data available</p>}
          </Block>

          <div className="ins-grid">
            <Block title="Team Performance" error={!teams} action={<Link to="/teams">View teams</Link>}>
              {teams && teams.length ? (
                <div className="ins-table-wrap">
                  <table>
                    <thead><tr><th>Team</th><th>Members</th><th>Active Projects</th><th>Assigned</th><th>Completed</th><th>Overdue</th><th>Completion</th><th>Utilization</th></tr></thead>
                    <tbody>
                      {teams.map((row) => (
                        <tr key={row.id}>
                          <td><Link to={`/teams/${row.id}`}>{row.name}</Link></td>
                          <td>{row.members}</td>
                          <td>{row.activeProjects}</td>
                          <td>{row.assigned}</td>
                          <td>{row.completed}</td>
                          <td>{row.overdue}</td>
                          <td>{show(row.completion, row.completion == null ? '' : '%')}</td>
                          <td>{show(row.utilization, row.utilization == null ? '' : '%')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="ins-empty">No data available</p>}
            </Block>
            <Block title="Team Comparison" error={!teams}>
              <select className="select" aria-label="Comparison metric" value={metric} onChange={(event) => setMetric(event.target.value)}>
                <option value="completion">Completion %</option>
                <option value="completed">Tasks completed</option>
                <option value="assigned">Tasks pending</option>
                <option value="overdue">Overdue</option>
                <option value="utilization">Utilization</option>
              </select>
              {teams ? <Bars rows={teams.map((row) => ({ label: row.name, value: metric === 'assigned' ? Math.max(0, row.assigned - row.completed) : row[metric] ?? 0 }))} /> : <Button onClick={load}>Retry</Button>}
            </Block>
          </div>

          <div className="ins-grid">
            <Block title="Workload & Capacity" error={data.workload?.error}>
              {data.workload?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <div className="ins-metrics">
                    <span>Underutilized <strong>{data.workload.underutilized}</strong></span>
                    <span>Balanced <strong>{data.workload.balanced}</strong></span>
                    <span>High load <strong>{data.workload.high}</strong></span>
                    <span>Overloaded <strong>{data.workload.overloaded}</strong></span>
                  </div>
                  {data.workload.employees.length ? (
                    <div className="ins-table-wrap">
                      <table>
                        <thead><tr><th>Employee</th><th>Team</th><th>Assigned</th><th>Logged</th><th>Capacity</th><th>Utilization</th><th>Status</th></tr></thead>
                        <tbody>
                          {data.workload.employees.map((row) => (
                            <tr key={row.id}>
                              <td>{row.name}</td>
                              <td>{row.team || '—'}</td>
                              <td>{row.assigned}</td>
                              <td>{row.logged}</td>
                              <td>{row.capacity}</td>
                              <td>{show(row.utilization, row.utilization == null ? '' : '%')}</td>
                              <td>{row.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="ins-empty">No data available</p>}
                </>
              )}
            </Block>
            <Block title="Daily Work Update Compliance" error={data.daily?.error} action={<Link to="/daily-work-updates">View updates</Link>}>
              {data.daily?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <div className="ins-metrics">
                    <span>Expected <strong>{data.daily.expected}</strong></span>
                    <span>Submitted <strong>{data.daily.submitted}</strong></span>
                    <span>Pending <strong>{data.daily.pending}</strong></span>
                    <span>Submission <strong>{show(data.daily.percent, data.daily.percent == null ? '' : '%')}</strong></span>
                  </div>
                  <h3>Top contributors</h3>
                  <Bars rows={(data.daily.contributors || []).map((row) => ({ label: row.name, value: row.updates }))} />
                  <h3>Pending submissions</h3>
                  {(data.daily.missing || []).length ? <ul>{data.daily.missing.map((name) => <li key={name}>{name}</li>)}</ul> : <p className="ins-empty">No data available</p>}
                  <h3>Teams with missing updates</h3>
                  <Bars rows={(data.daily.teams || []).map((row) => ({ label: row.name, value: row.missing }))} />
                </>
              )}
            </Block>
          </div>

          <div className="ins-grid">
            <Block title="Timesheet Insights" error={data.time?.error}>
              {data.time?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <div className="ins-metrics">
                    <span>Hours logged <strong>{data.time.total}</strong></span>
                    <span>Average <strong>{show(data.time.average)}</strong></span>
                    <span>Billable <strong>{data.time.billable}</strong></span>
                    <span>Non-billable <strong>{data.time.nonBillable}</strong></span>
                    <span>Attendance hours <strong>{data.time.attendance}</strong></span>
                    <span>Weekly target <strong>{show(data.time.achievement, data.time.achievement == null ? '' : '%')}</strong></span>
                  </div>
                  <h3>Hours logged by day</h3>
                  <Bars rows={(data.time.days || []).map((row) => ({ label: row.date.slice(5), value: row.hours }))} />
                </>
              )}
            </Block>
            <Block title="Lead Conversion Funnel" error={data.leads?.error} action={<Link to="/lead-pipeline">View pipeline</Link>}>
              {data.leads?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <Bars rows={[
                    { label: 'Leads', value: data.leads.total },
                    { label: 'PM review', value: data.leads.submitted },
                    { label: 'Approved', value: data.leads.approved },
                    { label: 'Feasibility', value: data.leads.feasibility },
                    { label: 'Solution & Costing', value: data.leads.costing },
                    { label: 'Won', value: data.leads.won },
                  ]} />
                  <p>Conversion {show(data.leads.conversion, data.leads.conversion == null ? '' : '%')} · Feasibility {show(data.leads.feasibilityRate, data.leads.feasibilityRate == null ? '' : '%')} · Costing {show(data.leads.costingRate, data.leads.costingRate == null ? '' : '%')}</p>
                </>
              )}
            </Block>
          </div>

          <div className="ins-grid">
            <Block title="Feasibility Insights" error={data.feasibility?.error} action={<Link to="/feasibility-studies">View studies</Link>}>
              {data.feasibility?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <div className="ins-metrics">
                    <span>Total <strong>{data.feasibility.total}</strong></span>
                    <span>In progress <strong>{data.feasibility.inProgress}</strong></span>
                    <span>Feasible <strong>{data.feasibility.feasible}</strong></span>
                    <span>With conditions <strong>{data.feasibility.conditional}</strong></span>
                    <span>Not feasible <strong>{data.feasibility.notFeasible}</strong></span>
                    <span>Pending input <strong>{data.feasibility.pendingInput}</strong></span>
                  </div>
                  <p>Average completion {data.feasibility.averageDays == null ? 'No data' : `${data.feasibility.averageDays} days`}</p>
                  <Bars rows={(data.feasibility.teams || []).map((row) => ({ label: row.name, value: row.studies }))} />
                </>
              )}
            </Block>
            <Block title="Solution & Costing" error={data.costing?.error} action={<Link to="/solution-costing">View costing</Link>}>
              {data.costing?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <div className="ins-metrics">
                    <span>Total <strong>{data.costing.total}</strong></span>
                    <span>Draft <strong>{data.costing.draft}</strong></span>
                    <span>Under review <strong>{data.costing.review}</strong></span>
                    <span>Approved <strong>{data.costing.approved}</strong></span>
                    <span>Rejected <strong>{data.costing.rejected}</strong></span>
                    <span>Superseded <strong>{data.costing.superseded}</strong></span>
                  </div>
                  {data.costing.commercial ? (
                    <p>Internal cost {data.costing.internal} · Selling value {data.costing.selling} · Average margin {data.costing.margin}%</p>
                  ) : <p>Commercial totals are hidden for this role.</p>}
                </>
              )}
            </Block>
          </div>

          <div className="ins-grid">
            <Block title="Procurement" error={data.procurement?.error} action={<Link to="/procurement-requests">View requests</Link>}>
              {data.procurement?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <Bars rows={[
                    { label: 'Open', value: data.procurement.open },
                    { label: 'Pending review', value: data.procurement.pending },
                    { label: 'Approved', value: data.procurement.approved },
                    { label: 'Ordered', value: data.procurement.ordered },
                    { label: 'Delayed', value: data.procurement.delayed },
                    { label: 'Received', value: data.procurement.received },
                  ]} />
                  <p>Average lead time {data.procurement.leadDays == null ? 'No data' : `${data.procurement.leadDays} days`}</p>
                  {(data.procurement.items || []).map((item) => (
                    <p key={item.id}><Link to={item.href}>{item.title}</Link> · {item.vendor || 'No vendor'} · {item.days} days</p>
                  ))}
                </>
              )}
            </Block>
            <Block title="Escalations" error={data.escalations?.error} action={<Link to="/escalations">View escalations</Link>}>
              {data.escalations?.error ? <Button onClick={load}>Retry</Button> : (
                <>
                  <div className="ins-metrics">
                    <Link to="/escalations?quick=open">Open <strong>{data.escalations.open}</strong></Link>
                    <Link to="/escalations?priority=CRITICAL">Critical <strong>{data.escalations.critical}</strong></Link>
                    <Link to="/escalations?overdue=true">Overdue <strong>{data.escalations.overdue}</strong></Link>
                    <Link to="/escalations?status=UNDER_REVIEW">Under review <strong>{data.escalations.underReview}</strong></Link>
                    <span>Resolved <strong>{data.escalations.resolved}</strong></span>
                  </div>
                  <h3>By team</h3>
                  <Bars rows={(data.escalations.byTeam || []).map((row) => ({ label: row.name, value: row.total }))} />
                  <h3>By type</h3>
                  <Bars rows={(data.escalations.byType || []).map((row) => ({ label: row.type, value: row.total }))} />
                </>
              )}
            </Block>
          </div>

          <Block title="Project Risk Overview" error={!Array.isArray(data.risks)}>
            {Array.isArray(data.risks) && data.risks.length ? data.risks.map((row) => (
              <p key={row.id}><Link to={row.href}>{row.title}</Link> — {row.reasons.join(', ') || 'Needs review'}</p>
            )) : <p className="ins-empty">No data available</p>}
          </Block>

          <Block title="Management Attention Required" error={!Array.isArray(data.attention)}>
            {Array.isArray(data.attention) && data.attention.length ? (
              <div className="ins-table-wrap">
                <table>
                  <thead><tr><th>Priority</th><th>Issue</th><th>Project</th><th>Owner</th><th>Due</th><th>Action</th></tr></thead>
                  <tbody>
                    {data.attention.map((row) => (
                      <tr key={`${row.issue}-${row.owner}-${row.due}`}>
                        <td>{row.priority}</td>
                        <td>{row.issue}</td>
                        <td>{row.project || '—'}</td>
                        <td>{row.owner || '—'}</td>
                        <td>{row.due || '—'}</td>
                        <td>{row.href ? <Link to={row.href}>Open</Link> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="ins-empty">No data available</p>}
          </Block>

          <Block title="Recent Activity" error={!Array.isArray(data.activity)}>
            {Array.isArray(data.activity) && data.activity.length ? (
              <ul className="ins-activity">
                {data.activity.map((row) => (
                  <li key={`${row.at}-${row.action}-${row.record}`}>
                    <strong>{row.user}</strong> {row.action} {row.href ? <Link to={row.href}>{row.record}</Link> : row.record}
                    <time>{row.at ? new Date(row.at).toLocaleString() : ''}</time>
                  </li>
                ))}
              </ul>
            ) : <p className="ins-empty">No data available</p>}
          </Block>
        </>
      ) : null}
    </PageContainer>
  );
}
