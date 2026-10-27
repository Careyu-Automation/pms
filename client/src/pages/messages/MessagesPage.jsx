import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MessageSquare, Plus, Search } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  addGroupMember,
  createGroup,
  createThread,
  deleteMessage,
  editMessage,
  getConversation,
  getMessageLookup,
  listDirect,
  listGroups,
  listThreads,
  markRead,
  markUnread,
  messageHistory,
  openDirect,
  pinMessage,
  reactMessage,
  removeGroupMember,
  searchMessages,
  sendMessage,
  setGroupRole,
  attachmentUrl,
} from '../../services/messages.service';
import { connectMessages, messageConnection, onMessageEvent, sendSocket } from '../../services/messagesSocket';
import { formatStamp, isImageName, presenceLabel, receiptLabel, REACTIONS } from './messagesModel';
import '../../styles/messages.css';

const MODES = [
  ['direct', 'Direct'],
  ['groups', 'Groups'],
  ['forum', 'Forum'],
  ['live', 'Live Chat'],
];

export default function MessagesPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const mode = MODES.some(([id]) => id === params.get('mode')) ? params.get('mode') : 'direct';
  const conversationId = params.get('conversation') || '';
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [lookup, setLookup] = useState(null);
  const [direct, setDirect] = useState(null);
  const [groups, setGroups] = useState(null);
  const [threads, setThreads] = useState(null);
  const [results, setResults] = useState(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [connection, setConnection] = useState('reconnecting');

  function setMode(next, extra = {}) {
    const values = new URLSearchParams(params);
    values.set('mode', next);
    Object.entries(extra).forEach(([key, value]) => {
      if (value) values.set(key, value);
      else values.delete(key);
    });
    if (!extra.conversation) values.delete('conversation');
    setParams(values, { replace: true });
  }

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    connectMessages();
    const stop = onMessageEvent((event) => {
      if (event.type === 'connection') setConnection(event.state);
      if (event.type === 'connected') setConnection('connected');
      if (['message', 'conversation', 'presence', 'forum'].includes(event.type)) {
        window.dispatchEvent(new Event('messages:refresh'));
      }
    });
    const beat = setInterval(() => sendSocket({ type: 'activity' }), 60000);
    setConnection(messageConnection());
    return () => {
      stop();
      clearInterval(beat);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setFailed(false);
    const load = () => {
      const requests = [getMessageLookup()];
      if (mode === 'direct' || mode === 'live') requests.push(listDirect(query));
      if (mode === 'groups') requests.push(listGroups(query));
      if (mode === 'forum') requests.push(listThreads({ q: query, category: params.get('category') || '', tag: params.get('tag') || '', teamId: params.get('teamId') || '' }));
      if (query.length >= 2) requests.push(searchMessages(query));
      Promise.all(requests).then((responses) => {
        if (!active) return;
        setLookup(responses[0].data);
        let index = 1;
        if (mode === 'direct' || mode === 'live') setDirect(responses[index++].data);
        if (mode === 'groups') setGroups(responses[index++].data);
        if (mode === 'forum') setThreads(responses[index++].data);
        setResults(query.length >= 2 ? responses[index]?.data : null);
      }).catch((error) => {
        if (!active) return;
        setFailed(true);
        push({ tone: 'danger', message: error.message });
      });
    };
    load();
    window.addEventListener('messages:refresh', load);
    return () => {
      active = false;
      window.removeEventListener('messages:refresh', load);
    };
  }, [mode, query, params]);

  const activeCount = lookup?.active?.length || direct?.active || 0;

  return (
    <PageContainer>
      <header className="msg-head">
        <p>Communication</p>
        <h1>Messages</h1>
        <span>Connect with teammates through direct messages, groups, discussions and live chat.</span>
        <small className={connection === 'connected' ? 'is-on' : ''}>{connection === 'connected' ? 'Connected' : 'Reconnecting...'}</small>
      </header>
      <div className={`msg-shell ${conversationId ? 'is-chat' : ''} ${mode === 'forum' ? 'is-forum' : ''}`}>
        <aside className="msg-nav">
          <div className="msg-switch" role="tablist">
            {MODES.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? 'is-active' : ''} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
          <label className="msg-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === 'groups' ? 'Search groups...' : mode === 'forum' ? 'Search threads...' : 'Search employees...'} />
          </label>
          {mode !== 'forum' ? <p className="msg-active">● {activeCount} {activeCount === 1 ? 'user' : 'users'} active in Project Hub</p> : null}
          {failed ? <ErrorState title="Unable to load conversations." action={<Button onClick={() => window.dispatchEvent(new Event('messages:refresh'))}>Retry</Button>} /> : null}
          {results ? <SearchResults results={results} onOpen={(item) => item.threadId || item.kind === 'THREAD' ? navigate(`/messages/forum/${item.threadId || item.id}`) : setMode(item.kind === 'GROUP' ? 'groups' : 'direct', { conversation: item.conversationId })} /> : null}
          {!results && mode === 'direct' ? <DirectList data={direct} onOpen={(id) => setMode('direct', { conversation: id })} onStart={(userId) => openDirect(userId).then((result) => setMode('direct', { conversation: result.data.conversation.id })).catch((error) => push({ tone: 'danger', message: error.message }))} /> : null}
          {!results && mode === 'groups' ? <GroupList data={groups} onOpen={(id) => setMode('groups', { conversation: id })} onCreate={() => setCreating(true)} /> : null}
          {!results && mode === 'live' ? <LiveList people={lookup?.active || []} selfId={user?.id} onOpen={(userId) => openDirect(userId).then((result) => setMode('direct', { conversation: result.data.conversation.id })).catch((error) => push({ tone: 'danger', message: error.message }))} /> : null}
          {!results && mode === 'forum' ? (
            <div className="msg-forum-nav">
              {[['','All Threads'], ['DISCUSSION','Discussions'], ['QUESTION','Questions'], ['IDEA','Ideas']].map(([id, label]) => (
                <button key={label} type="button" className={(params.get('category') || '') === id ? 'is-active' : ''} onClick={() => setMode('forum', { category: id })}>{label}</button>
              ))}
              <select className="select" aria-label="Team" value={params.get('teamId') || ''} onChange={(event) => setMode('forum', { teamId: event.target.value, category: params.get('category') || '' })}>
                <option value="">All teams</option>
                {(lookup?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <select className="select" aria-label="Tag" value={params.get('tag') || ''} onChange={(event) => setMode('forum', { tag: event.target.value, category: params.get('category') || '' })}>
                <option value="">Tags</option>
                {(lookup?.tags || []).map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </div>
          ) : null}
        </aside>
        <section className="msg-work">
          {mode === 'forum' ? (
            <ForumList
              data={threads}
              onCreate={() => setThreadOpen(true)}
              onOpen={(id) => navigate(`/messages/forum/${id}`)}
              onMore={() => {
                const last = threads?.threads?.at(-1);
                if (!last) return;
                listThreads({ q: query, category: params.get('category') || '', tag: params.get('tag') || '', teamId: params.get('teamId') || '', before: last.lastActivityAt }).then((result) => {
                  setThreads((current) => ({
                    threads: [...(current?.threads || []), ...result.data.threads.filter((item) => !(current?.threads || []).some((row) => row.id === item.id))],
                    hasMore: result.data.hasMore,
                  }));
                }).catch((error) => push({ tone: 'danger', message: error.message }));
              }}
            />
          ) : conversationId ? (
            <ChatPane
              conversationId={conversationId}
              selfId={user?.id}
              lookup={lookup}
              onBack={() => setMode(mode)}
            />
          ) : (
            <EmptyState icon={MessageSquare} title={mode === 'live' ? 'Choose someone who is active.' : 'Select a conversation.'} description="Direct messages stay private. Groups are for a team or project. Forum threads keep decisions." />
          )}
        </section>
      </div>
      <GroupModal open={creating} people={lookup?.people || []} teams={lookup?.teams || []} projects={lookup?.projects || []} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setMode('groups', { conversation: id }); }} />
      <ThreadModal open={threadOpen} lookup={lookup} onClose={() => setThreadOpen(false)} onCreated={(id) => { setThreadOpen(false); navigate(`/messages/forum/${id}`); }} />
    </PageContainer>
  );
}

function DirectList({ data, onOpen, onStart }) {
  if (!data) return <div className="msg-skeleton" />;
  return (
    <div className="msg-list">
      <p>Recent conversations</p>
      {data.conversations.length ? data.conversations.map((item) => (
        <button key={item.id} type="button" className="msg-row" onClick={() => onOpen(item.id)}>
          <Avatar name={item.name} />
          <span>
            <strong>{item.name}</strong>
            <small>{item.designation || item.teamName}</small>
            <small>{item.lastBody || 'No messages yet'}</small>
          </span>
          <em>{formatStamp(item.lastAt)}</em>
          {item.unread ? <i /> : null}
          <b className={item.presence === 'ONLINE' ? 'is-on' : ''} />
        </button>
      )) : <p className="msg-empty">No conversations yet. Start a conversation with a teammate.</p>}
      <p>Start a conversation</p>
      {data.people.map((person) => (
        <button key={person.id} type="button" className="msg-row" onClick={() => onStart(person.id)}>
          <Avatar name={person.name} />
          <span><strong>{person.name}</strong><small>{person.designation}{person.teamName ? ` · ${person.teamName}` : ''}</small></span>
        </button>
      ))}
    </div>
  );
}

function GroupList({ data, onOpen, onCreate }) {
  if (!data) return <div className="msg-skeleton" />;
  return (
    <div className="msg-list">
      <Button onClick={onCreate}><Plus size={16} /> New Group</Button>
      {data.groups.length ? data.groups.map((group) => (
        <button key={group.id} type="button" className="msg-row" onClick={() => onOpen(group.id)}>
          <Avatar name={group.name} />
          <span>
            <strong>{group.name}</strong>
            <small>{group.members} members{group.online ? ` · ${group.online} online` : ''}</small>
            <small>{group.lastBody || group.description || 'No messages yet'}</small>
          </span>
          <em>{formatStamp(group.lastAt)}</em>
          {group.unread ? <i /> : null}
        </button>
      )) : <p className="msg-empty">No groups yet. Create a group to collaborate with your team.</p>}
    </div>
  );
}

function LiveList({ people, selfId, onOpen }) {
  const others = people.filter((person) => person.id !== selfId && person.status !== 'OFFLINE');
  if (!others.length) return <p className="msg-empty">No one is online right now.</p>;
  return (
    <div className="msg-list">
      <p>Active now</p>
      {others.map((person) => (
        <button key={person.id} type="button" className="msg-row" onClick={() => onOpen(person.id)}>
          <Avatar name={person.name} />
          <span><strong>{person.name}</strong><small>{person.teamName || person.designation || presenceLabel(person.status)}</small></span>
          <b className="is-on" />
        </button>
      ))}
    </div>
  );
}

function ForumList({ data, onCreate, onOpen, onMore }) {
  if (!data) return <div className="msg-skeleton" />;
  return (
    <div className="msg-forum">
      <header>
        <div>
          <p>Forum threads</p>
          <h2>Organized threads for messages, questions and ideas.</h2>
        </div>
        <Button onClick={onCreate}><Plus size={16} /> New Thread</Button>
      </header>
      {data.threads.length ? data.threads.map((thread) => (
        <article key={thread.id}>
          <button type="button" onClick={() => onOpen(thread.id)}>
            <strong>{thread.title}</strong>
            <span>{thread.category} · {thread.status}</span>
            <small>Started by {thread.authorName} · {thread.replies} replies · {thread.views} views · {formatStamp(thread.lastActivityAt)}</small>
            <small>{thread.tags.join(' · ') || 'No tags'}{thread.projectTitle ? ` · ${thread.projectTitle}` : ''}{thread.teamName ? ` · ${thread.teamName}` : ''}</small>
          </button>
        </article>
      )) : <EmptyState icon={MessageSquare} title="No threads yet" description="Start a discussion, ask a question, or share an idea." />}
      {data.hasMore ? <Button variant="secondary" onClick={onMore}>Load more</Button> : null}
    </div>
  );
}

function SearchResults({ results, onOpen }) {
  const rows = [...(results.messages || []), ...(results.threads || []), ...(results.replies || [])];
  if (!rows.length) return <p className="msg-empty">No messages match that search.</p>;
  return (
    <div className="msg-list">
      {rows.map((item) => (
        <button key={`${item.kind}-${item.id}`} type="button" className="msg-row" onClick={() => onOpen(item)}>
          <span><strong>{item.title}</strong><small>{item.kind} · {item.sender}</small><small>{item.snippet?.slice(0, 120)}</small></span>
        </button>
      ))}
    </div>
  );
}

function ChatPane({ conversationId, selfId, lookup, onBack }) {
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [reply, setReply] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menu, setMenu] = useState(null);
  const [info, setInfo] = useState(false);
  const [typing, setTyping] = useState([]);
  const [emoji, setEmoji] = useState(false);
  const scroller = useRef(null);
  const stick = useRef(true);
  const older = useRef(false);
  const typingTimer = useRef(null);
  const [forward, setForward] = useState(null);
  const [history, setHistory] = useState(null);

  function load(before, mark = false) {
    return getConversation(conversationId, before).then((result) => {
      setData((current) => {
        if (!before) return result.data;
        const known = new Set((current?.messages || []).map((item) => item.id));
        return { ...result.data, messages: [...result.data.messages.filter((item) => !known.has(item.id)), ...(current?.messages || [])] };
      });
      const latest = result.data.messages.at(-1);
      if (mark && latest) markRead(conversationId, latest.id).catch(() => {});
    });
  }

  useEffect(() => {
    let active = true;
    setData(null);
    load(undefined, true).catch((error) => { if (active) push({ tone: 'danger', message: error.message }); });
    sendSocket({ type: 'viewing', conversationId });
    const stop = onMessageEvent((event) => {
      if (event.type === 'typing' && event.conversationId === conversationId && event.userId !== selfId) {
        setTyping((current) => event.active ? [...new Set([...current, event.name])] : current.filter((name) => name !== event.name));
      }
      if (['message', 'message:updated', 'message:deleted', 'reaction', 'read'].includes(event.type) && event.conversationId === conversationId && event.userId !== selfId) {
        load(undefined, event.type === 'message').catch(() => {});
      }
    });
    const closeMenu = (event) => {
      if (event.target.closest('.msg-menu')) return;
      setMenu(null);
    };
    window.addEventListener('pointerdown', closeMenu);
    return () => {
      active = false;
      stop();
      window.removeEventListener('pointerdown', closeMenu);
      sendSocket({ type: 'viewing', conversationId: '' });
    };
  }, [conversationId]);

  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [data?.messages?.length]);

  async function submit() {
    const body = text.trim();
    if (!body && !editing) return;
    try {
      if (editing) {
        await editMessage(editing.id, body);
        setEditing(null);
      } else {
        const form = new FormData();
        form.set('body', body);
        if (reply) form.set('replyToId', reply.id);
        await sendMessage(conversationId, form);
        setReply(null);
      }
      setText('');
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message || 'Unable to send message.' });
    }
  }

  function onType(value) {
    setText(value);
    sendSocket({ type: 'typing', conversationId, active: true });
    sendSocket({ type: 'activity' });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sendSocket({ type: 'typing', conversationId, active: false }), 1500);
  }

  const mentionQuery = text.match(/(?:^|\s)@([^\s@]*)$/);
  const mentions = mentionQuery
    ? (lookup?.people || []).filter((person) => person.id !== selfId && person.name.toLowerCase().includes(mentionQuery[1].toLowerCase())).slice(0, 6)
    : [];

  const conversation = data?.conversation;
  const other = data?.members?.find((person) => person.id !== selfId);
  const title = conversation?.type === 'GROUP' ? conversation.name : other?.name;
  const typingText = typing.length > 2 ? `${typing[0]} and ${typing.length - 1} others are typing...` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing...` : typing.length === 1 ? `${typing[0]} is typing...` : '';

  return (
    <div className="msg-chat">
      <header>
        <button type="button" className="msg-back" onClick={onBack}>Back</button>
        <div>
          <strong>{title || 'Conversation'}</strong>
          <small>{conversation?.type === 'GROUP' ? `${conversation.members} members` : presenceLabel(other?.presence, other?.lastSeenAt)}{conversation?.description ? ` · ${conversation.description}` : ''}</small>
        </div>
        {conversation?.type === 'GROUP' ? <Button variant="secondary" onClick={() => setInfo(true)}>Group info</Button> : null}
        <button type="button" className="icon-button" disabled title="Calls will be available later" aria-label="Call">Call</button>
      </header>
      {data?.pins?.length ? <div className="msg-pins">{data.pins.map((pin) => <button key={pin.messageId} type="button" onClick={() => document.getElementById(`message-${pin.messageId}`)?.scrollIntoView({ block: 'center' })}>Pinned · {pin.body}</button>)}</div> : null}
      <div className="msg-stream" ref={scroller} onScroll={(event) => {
        stick.current = event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight < 80;
        if (event.currentTarget.scrollTop < 40 && data?.hasMore && !older.current && data.messages[0]) {
          older.current = true;
          const previous = event.currentTarget.scrollHeight;
          load(data.messages[0].createdAt).finally(() => {
            older.current = false;
            if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight - previous;
          });
        }
      }}>
        {!data ? <div className="msg-skeleton" /> : null}
        {(data?.messages || []).map((message, index, list) => {
          const mine = message.senderId === selfId;
          const previous = list[index - 1];
          const showName = conversation?.type === 'GROUP' && !mine && previous?.senderId !== message.senderId;
          return (
            <article id={`message-${message.id}`} key={message.id} className={mine ? 'is-mine' : ''} onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, message }); }}>
              {showName ? <strong>{message.senderName}</strong> : null}
              {message.replyToId ? <button type="button" className="msg-quote" onClick={() => document.getElementById(`message-${message.replyToId}`)?.scrollIntoView({ block: 'center' })}>{message.replyName}: {message.replyBody}</button> : null}
              <p>{message.deleted ? 'This message was deleted' : message.body}</p>
              {message.attachments?.map((file) => (
                isImageName(file.name)
                  ? <a key={file.id} href={attachmentUrl(file.id)} target="_blank" rel="noreferrer"><img className="msg-preview" src={attachmentUrl(file.id)} alt={file.name} /></a>
                  : <a key={file.id} href={attachmentUrl(file.id)} target="_blank" rel="noreferrer">{file.name}</a>
              ))}
              <small>{formatStamp(message.createdAt)}{message.editedAt ? ' · Edited' : ''} {mine ? receiptLabel(message.receipt) : ''}</small>
              {message.reactions?.length ? <span className="msg-reacts">{REACTIONS.filter((emoji) => message.reactions.some((item) => item.emoji === emoji)).map((emoji) => `${emoji}${message.reactions.filter((item) => item.emoji === emoji).length}`).join(' ')}</span> : null}
            </article>
          );
        })}
      </div>
      {typingText ? <p className="msg-typing">{typingText}</p> : null}
      {reply ? <p className="msg-replying">Replying to {reply.senderName} <button type="button" onClick={() => setReply(null)}>Cancel</button></p> : null}
      {mentions.length ? (
        <div className="msg-suggest">
          {mentions.map((person) => (
            <button key={person.id} type="button" onClick={() => setText((value) => value.replace(/(?:^|\s)@([^\s@]*)$/, (match, _name, offset) => `${offset ? ' ' : ''}@${person.name} `))}>{person.name}</button>
          ))}
        </div>
      ) : null}
      {forward ? (
        <div className="msg-forward">
          <p>Forward to</p>
          {(lookup?.people || []).filter((person) => person.id !== selfId).slice(0, 8).map((person) => (
            <button key={person.id} type="button" onClick={() => {
              const form = new FormData();
              form.set('forwardMessageId', forward.id);
              openDirect(person.id).then((result) => sendMessage(result.data.conversation.id, form)).then(() => {
                setForward(null);
                push({ message: `Forwarded to ${person.name}` });
              }).catch((error) => push({ tone: 'danger', message: error.message }));
            }}>{person.name}</button>
          ))}
          <button type="button" onClick={() => setForward(null)}>Cancel</button>
        </div>
      ) : null}
      {history ? (
        <div className="msg-history">
          <p>Edit history</p>
          {history.map((item) => <small key={item.editedAt}>{formatStamp(item.editedAt)} · {item.body}</small>)}
          <button type="button" onClick={() => setHistory(null)}>Close</button>
        </div>
      ) : null}
      <form className="msg-composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <input className="msg-file" type="file" aria-label="Attach a file" onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const form = new FormData();
          form.set('body', text.trim());
          form.set('files', file);
          try {
            await sendMessage(conversationId, form);
            setText('');
            await load();
          } catch (error) {
            push({ tone: 'danger', message: error.message });
          }
        }} />
        <textarea rows={1} placeholder="Write a message" value={text} onChange={(event) => onType(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === 'Escape') sendSocket({ type: 'typing', conversationId, active: false });
        }} onBlur={() => sendSocket({ type: 'typing', conversationId, active: false })} />
        <button type="button" aria-label="Emoji" onClick={() => setEmoji((value) => !value)}>😊</button>
        <Button type="submit">Send</Button>
        {emoji ? <div className="msg-emoji">{['👍','❤️','😂','🎉','👀','✅','😀','🙏'].map((item) => <button key={item} type="button" onClick={() => { setText((value) => `${value}${item}`); setEmoji(false); }}>{item}</button>)}</div> : null}
      </form>
      {menu ? (
        <div className="msg-menu" style={{ top: menu.y, left: menu.x }}>
          <button type="button" onClick={() => { setReply(menu.message); setMenu(null); }}>Reply</button>
          {REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => { reactMessage(menu.message.id, emoji).then(() => load()); setMenu(null); }}>{emoji}</button>)}
          <button type="button" onClick={() => { navigator.clipboard.writeText(menu.message.body || ''); setMenu(null); }}>Copy</button>
          {menu.message.senderId === selfId && !menu.message.deleted ? <button type="button" onClick={() => { setEditing(menu.message); setText(menu.message.body); setMenu(null); }}>Edit</button> : null}
          {menu.message.senderId === selfId || conversation?.role === 'ADMIN' ? <button type="button" onClick={() => { deleteMessage(menu.message.id).then(() => load()); setMenu(null); }}>Delete</button> : null}
          <button type="button" onClick={() => { pinMessage(menu.message.id).then(() => load()); setMenu(null); }}>Pin</button>
          <button type="button" onClick={() => { setForward(menu.message); setMenu(null); }}>Forward</button>
          {menu.message.editedAt ? <button type="button" onClick={() => { messageHistory(menu.message.id).then((result) => setHistory(result.data.edits || [])).catch((error) => push({ tone: 'danger', message: error.message })); setMenu(null); }}>History</button> : null}
          <button type="button" onClick={() => { markUnread(conversationId).then(() => { window.dispatchEvent(new Event('messages:refresh')); setMenu(null); }); }}>Mark unread</button>
        </div>
      ) : null}
      {info && data ? <GroupInfo data={data} people={lookup?.people || []} selfId={selfId} onClose={() => setInfo(false)} onChange={() => load()} /> : null}
    </div>
  );
}

function GroupInfo({ data, people, selfId, onClose, onChange }) {
  const { push } = useToast();
  const [memberId, setMemberId] = useState('');
  const admin = data.conversation.role === 'ADMIN';
  return (
    <aside className="msg-info">
      <header><strong>{data.conversation.name}</strong><button type="button" onClick={onClose}>Close</button></header>
      <p>{data.conversation.description || 'No description'}</p>
      <p>Created {formatStamp(data.conversation.createdAt)}</p>
      {data.members.map((member) => (
        <div key={member.id} className="msg-member">
          <Avatar name={member.name} size="sm" />
          <span><strong>{member.name}</strong><small>{member.designation} · {member.role}</small></span>
          {admin && member.id !== selfId ? <button type="button" onClick={() => setGroupRole(data.conversation.id, member.id, member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN').then(onChange).catch((error) => push({ tone: 'danger', message: error.message }))}>{member.role === 'ADMIN' ? 'Member' : 'Make admin'}</button> : null}
          {admin && member.id !== selfId ? <button type="button" onClick={() => removeGroupMember(data.conversation.id, member.id).then(onChange).catch((error) => push({ tone: 'danger', message: error.message }))}>Remove</button> : null}
        </div>
      ))}
      {admin ? (
        <form onSubmit={(event) => { event.preventDefault(); addGroupMember(data.conversation.id, memberId).then(onChange).catch((error) => push({ tone: 'danger', message: error.message })); }}>
          <select className="select" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
            <option value="">Add member</option>
            {people.filter((person) => !data.members.some((member) => member.id === person.id)).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <Button type="submit" disabled={!memberId}>Add</Button>
        </form>
      ) : null}
      <Button variant="secondary" onClick={() => removeGroupMember(data.conversation.id, selfId).then(() => onClose()).catch((error) => push({ tone: 'danger', message: error.message }))}>Leave group</Button>
    </aside>
  );
}

function GroupModal({ open, people, teams, projects, onClose, onCreated }) {
  const { push } = useToast();
  const [form, setForm] = useState({ name: '', description: '', groupType: 'CUSTOM', memberIds: [], teamId: '', projectId: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setForm({ name: '', description: '', groupType: 'CUSTOM', memberIds: [], teamId: '', projectId: '' }); }, [open]);
  return (
    <Modal open={open} title="New group" onClose={onClose}>
      <form className="msg-form" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
          const result = await createGroup(form);
          onCreated(result.data.conversation.id);
        } catch (error) {
          push({ tone: 'danger', message: error.message });
        } finally {
          setBusy(false);
        }
      }}>
        <label className="field"><span className="field__label">Group name *</span><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field"><span className="field__label">Description</span><textarea className="input" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label className="field"><span className="field__label">Group type</span>
          <select className="select" value={form.groupType} onChange={(event) => setForm({ ...form, groupType: event.target.value })}>
            <option value="CUSTOM">Custom</option>
            <option value="TEAM">Team</option>
            <option value="PROJECT">Project</option>
            <option value="DEPARTMENT">Department</option>
          </select>
        </label>
        {form.groupType === 'TEAM' ? <select className="select" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}><option value="">Team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : null}
        {form.groupType === 'PROJECT' ? <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}><option value="">Project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select> : null}
        <div className="msg-chips">{form.memberIds.map((id) => <button key={id} type="button" onClick={() => setForm({ ...form, memberIds: form.memberIds.filter((item) => item !== id) })}>{people.find((person) => person.id === id)?.name || 'Member'} ×</button>)}</div>
        <select className="select" value="" onChange={(event) => { if (event.target.value) setForm({ ...form, memberIds: [...new Set([...form.memberIds, event.target.value])] }); }}>
          <option value="">Add members *</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </select>
        <div className="msg-form__actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Create Group</Button></div>
      </form>
    </Modal>
  );
}

function ThreadModal({ open, lookup, onClose, onCreated }) {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} title="New thread" onClose={onClose}>
      <form className="msg-form" onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        try {
          const result = await createThread(form);
          onCreated(result.data.thread.id);
        } catch (error) {
          push({ tone: 'danger', message: error.message });
        } finally {
          setBusy(false);
        }
      }}>
        <label className="field"><span className="field__label">Title *</span><input className="input" name="title" required /></label>
        <label className="field"><span className="field__label">Category *</span>
          <select className="select" name="category" defaultValue="DISCUSSION">
            <option value="DISCUSSION">Discussion</option>
            <option value="QUESTION">Question</option>
            <option value="IDEA">Idea</option>
          </select>
        </label>
        <label className="field"><span className="field__label">Description *</span><textarea className="input" name="body" rows={5} required /></label>
        <label className="field"><span className="field__label">Tags</span><input className="input" name="tags" placeholder="WCS, Integration" /></label>
        <label className="field"><span className="field__label">Project</span><select className="select" name="projectId"><option value="">None</option>{(lookup?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
        <label className="field"><span className="field__label">Team</span><select className="select" name="teamId"><option value="">None</option>{(lookup?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className="field"><span className="field__label">Attachments</span><input className="input" name="files" type="file" multiple /></label>
        <div className="msg-form__actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Post Thread</Button></div>
      </form>
    </Modal>
  );
}
