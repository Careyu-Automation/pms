import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Video } from 'lucide-react';
import { PageContainer, PageContent } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { listMeetings, saveTeamMeeting } from '../../services/teams.service';
import { MEETING_PLATFORM } from '../teams/teamModel';
import '../../styles/lead.css';
import '../../styles/teams.css';

export default function MeetingsPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { push } = useToast();
  const [status, setStatus] = useState('loading');
  const [meetings, setMeetings] = useState([]);
  const [teams, setTeams] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ teamId: '', name: 'Team meeting', platform: 'TEAMS', url: '', description: '' });

  function load() {
    setStatus('loading');
    return listMeetings().then((payload) => {
      setMeetings(payload.data.meetings || []);
      setTeams(payload.data.teams || []);
      setStatus('ready');
    }).catch((error) => {
      setStatus('error');
      push({ tone: 'danger', message: error.message });
    });
  }

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return meetings;
    return meetings.filter((meeting) => `${meeting.teamName} ${meeting.name} ${meeting.platform} ${meeting.url}`.toLowerCase().includes(query));
  }, [meetings, search]);

  function openAdd() {
    if (!teams.length) return;
    setForm({ teamId: teams[0].id, name: 'Team meeting', platform: 'TEAMS', url: '', description: '' });
    setOpen(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.teamId || busy) return;
    setBusy(true);
    try {
      await saveTeamMeeting(form.teamId, { ...form, isPrimary: true });
      setOpen(false);
      push({ tone: 'success', message: 'Meeting saved successfully.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Meetings"
        description="Team meeting links for Microsoft Teams, Google Meet, Zoom, and other calls."
        actions={teams.length ? <Button onClick={openAdd}>Add meeting</Button> : null}
      />
      <div className="teams-toolbar">
        <input className="input" placeholder="Search team or meeting..." value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      {status === 'loading' ? <div className="teams-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Unable to load meetings." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' && !meetings.length ? (
        <PageContent>
          <EmptyState icon={Video} title="No meetings yet" description="Add a meeting link for a team. It will appear in this list." />
        </PageContent>
      ) : null}
      {status === 'ready' && meetings.length && !rows.length ? (
        <PageContent>
          <EmptyState icon={Video} title="No matching meetings" description="Try another team or meeting name." />
        </PageContent>
      ) : null}
      {status === 'ready' && rows.length ? (
        <div className="teams-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Meeting</th><th>Team</th><th>Platform</th><th>Link</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((meeting) => (
                <tr key={meeting.id}>
                  <td>{meeting.name}{meeting.isPrimary ? <Badge tone="neutral">Primary</Badge> : null}</td>
                  <td><Link to={`/teams/${meeting.teamId}?tab=meetings`}>{meeting.teamName}</Link></td>
                  <td>{MEETING_PLATFORM[meeting.platform] || meeting.platform}</td>
                  <td>{meeting.url}</td>
                  <td className="teams-actions">
                    <a href={meeting.url} target="_blank" rel="noreferrer">Join</a>
                    <button type="button" onClick={() => navigator.clipboard.writeText(meeting.url).then(() => push({ tone: 'success', message: 'Meeting link copied.' }))}><Copy size={14} /> Copy</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal open={open} title="Add meeting" onClose={() => { if (!busy) setOpen(false); }}>
        <form className="teams-form" onSubmit={submit}>
          <label className="field is-wide"><span className="field__label">Team</span>
            <select className="select" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="field is-wide"><span className="field__label">Meeting name *</span><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field"><span className="field__label">Platform</span>
            <select className="select" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>
              {Object.entries(MEETING_PLATFORM).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Meeting URL *</span><input className="input" required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
          <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="teams-form__actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Save meeting</Button></div>
        </form>
      </Modal>
    </PageContainer>
  );
}
