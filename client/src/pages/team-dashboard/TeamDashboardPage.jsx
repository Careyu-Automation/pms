import { useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { MemberDetail } from '../../components/team-dashboard/MemberDetail';
import { ProjectContribution } from '../../components/team-dashboard/ProjectContribution';
import { SelectedTeam } from '../../components/team-dashboard/SelectedTeam';
import { TeamActivity } from '../../components/team-dashboard/TeamActivity';
import { TeamCard } from '../../components/team-dashboard/TeamCard';
import { TeamDashboardHeader } from '../../components/team-dashboard/TeamDashboardHeader';
import { TeamFilters } from '../../components/team-dashboard/TeamFilters';
import { TeamKpis } from '../../components/team-dashboard/TeamKpis';
import { TeamMembers } from '../../components/team-dashboard/TeamMembers';
import { TeamPerformance } from '../../components/team-dashboard/TeamPerformance';
import { TeamSkeleton } from '../../components/team-dashboard/TeamSkeleton';
import { TeamTasks } from '../../components/team-dashboard/TeamTasks';
import { TeamWorkloadPanel } from '../../components/team-dashboard/TeamWorkloadPanel';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { EscalationGlance } from '../escalations/EscalationGlance';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useTeamDashboard } from '../../hooks/useTeamDashboard';
import '../../styles/team-dashboard.css';

export default function TeamDashboardPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const {
    status,
    updatedAt,
    cards,
    detail,
    filters,
    setFilters,
    selectTeam,
    reload,
  } = useTeamDashboard();
  const [memberId, setMemberId] = useState(null);
  const member = detail?.members.find((item) => item.id === memberId) || null;
  const chooseTeam = (id) => {
    setMemberId(null);
    selectTeam(id);
  };

  return (
    <PageContainer>
      <TeamDashboardHeader updatedAt={updatedAt} refreshing={status === 'loading'} onRefresh={reload} />

      {status === 'error' ? (
        <section className="team-panel">
          <ErrorState
            title="Unable to load team information."
            action={<Button onClick={reload}>Retry</Button>}
          />
        </section>
      ) : null}

      {status === 'loading' && !detail ? <TeamSkeleton /> : null}

      {detail ? (
        <div className="team-dashboard">
          <section aria-label="Teams">
            <h2 className="team-kicker">Teams</h2>
            <div className="team-board">
              {cards.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  selected={team.id === detail.team.id}
                  onSelect={chooseTeam}
                />
              ))}
            </div>
          </section>

          <TeamFilters
            teams={cards}
            teamId={detail.team.id}
            projects={detail.projectOptions}
            filters={filters}
            onTeam={chooseTeam}
            onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          />

          <SelectedTeam team={detail.team} snapshot={detail.snapshot} />
          <TeamKpis snapshot={detail.snapshot} />
          <EscalationGlance teamId={detail.team.id} />
          <ProjectContribution projects={detail.projects} />

          <div className="team-split">
            <TeamWorkloadPanel workload={detail.workload} filtered={detail.filtersActive} />
            <TeamPerformance performance={detail.performance} filtered={detail.filtersActive} />
          </div>

          <TeamMembers members={detail.members} onSelect={(item) => setMemberId(item.id)} />
          <TeamTasks
            tasks={detail.tasks}
            status={filters.status}
            filtered={detail.filtersActive}
            onStatus={(status) => setFilters((current) => ({ ...current, status }))}
          />
          <TeamActivity items={detail.activity} />
          <MemberDetail member={member} onClose={() => setMemberId(null)} />
        </div>
      ) : null}
    </PageContainer>
  );
}
