import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CircleCheck,
  FolderKanban,
  ListTodo,
  PlayCircle,
} from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ActiveProjects } from '../../components/dashboard/ActiveProjects';
import { DashboardHeader } from '../../components/dashboard/DashboardHeader';
import { DashboardSkeleton } from '../../components/dashboard/DashboardSkeleton';
import { KpiCard } from '../../components/dashboard/KpiCard';
import { LeadPipeline } from '../../components/dashboard/LeadPipeline';
import { MyWork } from '../../components/dashboard/MyWork';
import { ProjectOverview } from '../../components/dashboard/ProjectOverview';
import { TeamWorkload } from '../../components/dashboard/TeamWorkload';
import { UpcomingDeadlines } from '../../components/dashboard/UpcomingDeadlines';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { RecentActivity } from '../../components/dashboard/RecentActivity';
import { IncomingLeadReviews } from '../../components/leads/IncomingLeadReviews';
import { AssignmentInbox } from '../../components/leads/AssignmentInbox';
import { EscalationGlance } from '../escalations/EscalationGlance';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useDashboardData } from '../../hooks/useDashboardData';
import { usePageMeta } from '../../hooks/usePageMeta';
import '../../styles/dashboard.css';

const KPI_ICONS = {
  total: FolderKanban,
  active: PlayCircle,
  pending: ListTodo,
  overdue: AlertCircle,
  completed: CircleCheck,
};

export default function DashboardPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { status, data, reload } = useDashboardData();

  return (
    <PageContainer>
      <DashboardHeader />
      <IncomingLeadReviews />
      <AssignmentInbox />

      {status === 'loading' ? <DashboardSkeleton /> : null}

      {status === 'error' ? (
        <section className="dash-card">
          <ErrorState
            title="Unable to load project data."
            action={<Button onClick={reload}>Retry</Button>}
          />
        </section>
      ) : null}

      {status === 'ready' && data ? (
        <div className="dashboard">
          <section className="kpi-row" aria-label="Workspace summary">
            {data.kpis.map((item) => (
              <KpiCard
                key={item.id}
                label={item.label}
                value={item.value}
                note={item.note}
                tone={item.tone}
                highlighted={item.id === 'total'}
                icon={KPI_ICONS[item.id] || FolderKanban}
              />
            ))}
          </section>
          {data.workflow?.length ? (
            <section className="workflow-queues" aria-label="Workflow queues">
              {data.workflow.map((item) => (
                <Link key={item.id} to={item.href}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </Link>
              ))}
            </section>
          ) : null}
          <EscalationGlance />

          <div className="dash-grid">
            <ProjectOverview statuses={data.statuses} />
            <LeadPipeline stages={data.pipeline} />
          </div>

          <ActiveProjects projects={data.projects} />

          <div className="dash-grid">
            <UpcomingDeadlines items={data.deadlines} />
            <MyWork tasks={data.myWork} />
          </div>

          <div className="dash-grid">
            <TeamWorkload teams={data.workload} />
            <RecentActivity items={data.activity} />
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
