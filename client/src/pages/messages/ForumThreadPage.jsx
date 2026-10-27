import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { attachmentUrl, deleteReply, editReply, followThread, getThread, reactReply, replyToThread, setThreadStatus } from '../../services/messages.service';
import { formatStamp, REACTIONS } from './messagesModel';
import '../../styles/messages.css';

const NEXT = {
  DISCUSSION: ['OPEN', 'CLOSED'],
  QUESTION: ['OPEN', 'ANSWERED', 'CLOSED'],
  IDEA: ['PROPOSED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'],
};

export default function ForumThreadPage() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState('');
  const [parent, setParent] = useState(null);
  const [editing, setEditing] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  useDocumentTitle(data?.thread?.title || 'Forum thread');

  function load() {
    return getThread(threadId).then((result) => setData(result.data)).catch((error) => {
      setFailed(true);
      push({ tone: 'danger', message: error.message });
    });
  }

  useEffect(() => {
    setData(null);
    setFailed(false);
    load();
  }, [threadId]);

  const thread = data?.thread;
  const replies = data?.replies || [];
  const roots = replies.filter((reply) => !reply.parentReplyId);

  async function submit(event) {
    event.preventDefault();
    try {
      if (editing) await editReply(editing.id, body);
      else await replyToThread(threadId, { body, parentReplyId: parent?.id });
      setBody('');
      setParent(null);
      setEditing(null);
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  if (failed) return <PageContainer><ErrorState title="Unable to load this thread." action={<Button onClick={() => navigate('/messages?mode=forum')}>Back</Button>} /></PageContainer>;
  if (!thread) return <PageContainer><div className="msg-skeleton" /></PageContainer>;

  return (
    <PageContainer>
      <article className="msg-thread">
        <button type="button" className="msg-back" onClick={() => navigate('/messages?mode=forum')}>Back</button>
        <p>{thread.category} · {thread.status}</p>
        <h1>{thread.title}</h1>
        <div className="msg-thread__author">
          <Avatar name={thread.authorName} />
          <span><strong>{thread.authorName}</strong><small>{thread.designation} · {formatStamp(thread.createdAt)}</small></span>
          <Button variant="secondary" onClick={() => followThread(threadId, !thread.following).then(load)}>{thread.following ? 'Following' : 'Follow'}</Button>
        </div>
        <p className="msg-thread__body">{thread.body}</p>
        <p>{thread.tags.map((tag) => `#${tag}`).join(' ')}</p>
        {thread.projectId ? <p>Project: <Link to={`/projects/${thread.projectId}`}>{thread.projectTitle || 'Open project'}</Link></p> : null}
        {thread.teamName ? <p>Team: {thread.teamName}</p> : null}
        {thread.attachments?.map((file) => <a key={file.id} href={attachmentUrl(file.id, true)}>{file.name}</a>)}
        {thread.canModerate && NEXT[thread.category] ? (
          <label className="field"><span className="field__label">Status</span>
            <select className="select" value={thread.status} onChange={(event) => setThreadStatus(threadId, event.target.value).then(load).catch((error) => push({ tone: 'danger', message: error.message }))}>
              {NEXT[thread.category].map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
        ) : null}
        <header className="msg-thread__replies">
          <h2>{thread.replies} replies</h2>
          <button type="button" onClick={() => setCollapsed((value) => !value)}>{collapsed ? 'Expand replies' : 'Collapse replies'}</button>
        </header>
        {!collapsed ? roots.map((reply) => (
          <Reply key={reply.id} reply={reply} childrenReplies={replies.filter((item) => item.parentReplyId === reply.id)} selfId={user?.id} onReply={setParent} onEdit={(item) => { setEditing(item); setBody(item.body); }} onChange={load} />
        )) : null}
        <form className="msg-composer" onSubmit={submit}>
          {parent ? <p className="msg-replying">Replying to {parent.authorName} <button type="button" onClick={() => setParent(null)}>Cancel</button></p> : null}
          <textarea rows={3} placeholder="Write a reply..." value={body} onChange={(event) => setBody(event.target.value)} required />
          <Button type="submit">{editing ? 'Save reply' : 'Send Reply'}</Button>
        </form>
      </article>
    </PageContainer>
  );
}

function Reply({ reply, childrenReplies, selfId, onReply, onEdit, onChange }) {
  const { push } = useToast();
  return (
    <div className="msg-reply">
      <Avatar name={reply.authorName} size="sm" />
      <div>
        <strong>{reply.authorName}</strong>
        <small>{reply.designation} · {formatStamp(reply.createdAt)}{reply.editedAt ? ' · Edited' : ''}</small>
        <p>{reply.deleted ? 'This reply was deleted' : reply.body}</p>
        <div className="msg-reacts">
          {REACTIONS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => reactReply(reply.id, emoji).then(onChange).catch((error) => push({ tone: 'danger', message: error.message }))}>
              {emoji}{reply.reactions.filter((item) => item.emoji === emoji).length || ''}
            </button>
          ))}
          {!reply.deleted ? <button type="button" onClick={() => onReply(reply)}>Reply</button> : null}
          {reply.authorId === selfId && !reply.deleted ? <button type="button" onClick={() => onEdit(reply)}>Edit</button> : null}
          {reply.authorId === selfId && !reply.deleted ? <button type="button" onClick={() => deleteReply(reply.id).then(onChange).catch((error) => push({ tone: 'danger', message: error.message }))}>Delete</button> : null}
        </div>
        {childrenReplies.map((child) => (
          <Reply key={child.id} reply={child} childrenReplies={[]} selfId={selfId} onReply={onReply} onEdit={onEdit} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}
