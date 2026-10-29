const { query } = require('./index');

function iso(value) {
  return value ? new Date(value).toISOString() : null;
}

async function directory(actorId, text) {
  const params = [actorId];
  let search = '';
  if (text) {
    params.push(`%${text}%`);
    search = `AND (u.full_name ILIKE $${params.length} OR COALESCE(u.designation, '') ILIKE $${params.length} OR COALESCE(t.name, '') ILIKE $${params.length})`;
  }
  const result = await query(
    `SELECT u.id, u.full_name, u.designation, u.department, t.name AS team_name, t.id AS team_id
     FROM users u
     LEFT JOIN LATERAL (
       SELECT tm.team_id FROM team_members tm
       JOIN teams tt ON tt.id = tm.team_id AND tt.status = 'ACTIVE'
       WHERE tm.user_id = u.id AND tm.status = 'ACTIVE'
       ORDER BY tt.name LIMIT 1
     ) membership ON TRUE
     LEFT JOIN teams t ON t.id = membership.team_id
     WHERE u.is_active = TRUE AND u.id <> $1
     ${search}
     ORDER BY u.full_name
     LIMIT 80`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.full_name,
    designation: row.designation || '',
    department: row.department || '',
    teamId: row.team_id,
    teamName: row.team_name || '',
  }));
}

async function teams() {
  const result = await query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`);
  return result.rows.map((row) => ({ id: row.id, name: row.name }));
}

async function projects() {
  const result = await query(`SELECT id, title, project_code FROM projects ORDER BY updated_at DESC LIMIT 80`);
  return result.rows.map((row) => ({ id: row.id, title: row.title, code: row.project_code }));
}

async function tasks() {
  const result = await query(
    `SELECT id, title, project_id FROM project_tasks WHERE status <> 'CANCELLED' ORDER BY updated_at DESC LIMIT 80`,
  );
  return result.rows.map((row) => ({ id: row.id, title: row.title, projectId: row.project_id }));
}

async function findDirect(a, b) {
  const result = await query(
    `SELECT c.id
     FROM conversations c
     JOIN conversation_members ma ON ma.conversation_id = c.id AND ma.user_id = $1
     JOIN conversation_members mb ON mb.conversation_id = c.id AND mb.user_id = $2
     WHERE c.type = 'DIRECT'
     LIMIT 1`,
    [a, b],
  );
  return result.rows[0]?.id || null;
}

async function insertConversation(client, input) {
  const result = await client.query(
    `INSERT INTO conversations (type, name, description, group_type, project_id, team_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.type, input.name || null, input.description || '', input.groupType || null, input.projectId || null, input.teamId || null, input.createdBy],
  );
  return result.rows[0].id;
}

async function addMember(client, conversationId, userId, role) {
  await client.query(
    `INSERT INTO conversation_members (conversation_id, user_id, role)
     SELECT $1, $2, $3
     WHERE NOT EXISTS (
       SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2
     )`,
    [conversationId, userId, role || 'MEMBER'],
  );
}

async function directList(userId, text) {
  const params = [userId];
  let search = '';
  if (text) {
    params.push(`%${text}%`);
    search = `AND (u.full_name ILIKE $${params.length} OR COALESCE(last.body, '') ILIKE $${params.length})`;
  }
  const result = await query(
    `SELECT c.id, c.updated_at, u.id AS user_id, u.full_name, u.designation,
        t.name AS team_name, me.last_read_at,
        last.body AS last_body, last.created_at AS last_at, last.sender_id AS last_sender, last.deleted_at AS last_deleted
     FROM conversations c
     JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1
     JOIN conversation_members them ON them.conversation_id = c.id AND them.user_id <> $1
     JOIN users u ON u.id = them.user_id
     LEFT JOIN LATERAL (
       SELECT tm.team_id FROM team_members tm
       JOIN teams tt ON tt.id = tm.team_id AND tt.status = 'ACTIVE'
       WHERE tm.user_id = u.id AND tm.status = 'ACTIVE' ORDER BY tt.name LIMIT 1
     ) membership ON TRUE
     LEFT JOIN teams t ON t.id = membership.team_id
     LEFT JOIN LATERAL (
       SELECT body, created_at, sender_id, deleted_at FROM messages
       WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
     ) last ON TRUE
     WHERE c.type = 'DIRECT' ${search}
     ORDER BY last.created_at DESC NULLS LAST, u.full_name`,
    params,
  );
  return result.rows.map((row) => mapConversationRow(row, userId));
}

async function groupList(userId, text) {
  const params = [userId];
  let search = '';
  if (text) {
    params.push(`%${text}%`);
    search = `AND (c.name ILIKE $${params.length} OR COALESCE(last.body, '') ILIKE $${params.length})`;
  }
  const result = await query(
    `SELECT c.id, c.name, c.description, c.group_type, c.project_id, c.team_id, c.created_by, c.created_at,
        me.last_read_at, me.role,
        (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS members,
        last.body AS last_body, last.created_at AS last_at, last.sender_id AS last_sender, last.deleted_at AS last_deleted
     FROM conversations c
     JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1
     LEFT JOIN LATERAL (
       SELECT body, created_at, sender_id, deleted_at FROM messages
       WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
     ) last ON TRUE
     WHERE c.type = 'GROUP' ${search}
     ORDER BY last.created_at DESC NULLS LAST, c.name`,
    params,
  );
  return result.rows.map((row) => ({
    ...mapConversationRow(row, userId),
    name: row.name,
    description: row.description || '',
    groupType: row.group_type,
    projectId: row.project_id,
    teamId: row.team_id,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    members: Number(row.members) || 0,
    role: row.role,
  }));
}

function mapConversationRow(row, viewerId) {
  const fromOther = Boolean(row.last_sender && row.last_sender !== viewerId);
  const unread = fromOther && Boolean(row.last_at) && (!row.last_read_at || new Date(row.last_at) > new Date(row.last_read_at));
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.full_name || row.name || '',
    designation: row.designation || '',
    teamName: row.team_name || '',
    lastBody: row.last_deleted ? 'Message deleted' : (row.last_body || ''),
    lastAt: iso(row.last_at),
    unread,
    lastReadAt: iso(row.last_read_at),
  };
}

async function conversationFor(userId, id) {
  const result = await query(
    `SELECT c.*, me.role, me.last_read_at,
        (SELECT COUNT(*) FROM conversation_members m WHERE m.conversation_id = c.id) AS members
     FROM conversations c
     JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $2
     WHERE c.id = $1`,
    [id, userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    name: row.name || '',
    description: row.description || '',
    groupType: row.group_type,
    projectId: row.project_id,
    teamId: row.team_id,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    role: row.role,
    lastReadAt: iso(row.last_read_at),
    members: Number(row.members) || 0,
  };
}

async function members(conversationId) {
  const result = await query(
    `SELECT m.user_id, m.role, m.joined_at, m.last_read_at, u.full_name, u.designation, t.name AS team_name
     FROM conversation_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN LATERAL (
       SELECT tm.team_id FROM team_members tm
       JOIN teams tt ON tt.id = tm.team_id AND tt.status = 'ACTIVE'
       WHERE tm.user_id = u.id AND tm.status = 'ACTIVE' ORDER BY tt.name LIMIT 1
     ) membership ON TRUE
     LEFT JOIN teams t ON t.id = membership.team_id
     WHERE m.conversation_id = $1
     ORDER BY u.full_name`,
    [conversationId],
  );
  return result.rows.map((row) => ({
    id: row.user_id,
    role: row.role,
    name: row.full_name,
    designation: row.designation || '',
    teamName: row.team_name || '',
    joinedAt: iso(row.joined_at),
    lastReadAt: iso(row.last_read_at),
  }));
}

async function messages(conversationId, before, limit) {
  const params = [conversationId];
  let cursor = '';
  if (before) {
    params.push(before);
    cursor = `AND m.created_at < $${params.length}`;
  }
  params.push(limit);
  const result = await query(
    `SELECT m.*, u.full_name AS sender_name,
        reply.body AS reply_body, reply.deleted_at AS reply_deleted, ru.full_name AS reply_name
     FROM messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN messages reply ON reply.id = m.reply_to_id
     LEFT JOIN users ru ON ru.id = reply.sender_id
     WHERE m.conversation_id = $1 ${cursor}
     ORDER BY m.created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows.reverse().map(mapMessage);
}

function mapMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderName: row.sender_name || 'Former member',
    body: row.deleted_at ? '' : (row.body || ''),
    deleted: Boolean(row.deleted_at),
    editedAt: iso(row.edited_at),
    deliveredAt: iso(row.delivered_at),
    createdAt: iso(row.created_at),
    replyToId: row.reply_to_id,
    replyBody: row.reply_deleted ? 'Message deleted' : (row.reply_body || ''),
    replyName: row.reply_name || '',
    projectId: row.project_id,
    taskId: row.task_id,
  };
}

async function attachmentsFor(messageIds) {
  if (!messageIds.length) return [];
  const result = await query(
    `SELECT id, message_id, file_name, stored_name, mime_type, size_bytes
     FROM message_attachments WHERE message_id = ANY($1::uuid[])`,
    [messageIds],
  );
  return result.rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    name: row.file_name,
    storedName: row.stored_name,
    mimeType: row.mime_type,
    size: row.size_bytes,
  }));
}

async function reactionsFor(messageIds) {
  if (!messageIds.length) return [];
  const result = await query(
    `SELECT message_id, user_id, emoji FROM message_reactions WHERE message_id = ANY($1::uuid[])`,
    [messageIds],
  );
  return result.rows.map((row) => ({ messageId: row.message_id, userId: row.user_id, emoji: row.emoji }));
}

async function pins(conversationId) {
  const result = await query(
    `SELECT p.message_id, p.pinned_at, m.body, m.deleted_at, u.full_name
     FROM message_pins p
     JOIN messages m ON m.id = p.message_id
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE p.conversation_id = $1
     ORDER BY p.pinned_at DESC`,
    [conversationId],
  );
  return result.rows.map((row) => ({
    messageId: row.message_id,
    body: row.deleted_at ? 'Message deleted' : row.body,
    senderName: row.full_name || '',
    pinnedAt: iso(row.pinned_at),
  }));
}

async function insertMessage(client, input) {
  const result = await client.query(
    `INSERT INTO messages (conversation_id, sender_id, body, reply_to_id, project_id, task_id, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
    [input.conversationId, input.senderId, input.body, input.replyToId || null, input.projectId || null, input.taskId || null, input.deliveredAt || null],
  );
  return { id: result.rows[0].id, createdAt: iso(result.rows[0].created_at) };
}

async function insertAttachment(client, input) {
  await client.query(
    `INSERT INTO message_attachments (message_id, file_name, stored_name, mime_type, size_bytes)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.messageId, input.name, input.storedName, input.mimeType, input.size],
  );
}

async function findMessage(id) {
  const result = await query(
    `SELECT m.*, c.type FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapMessage(row), type: row.type, deletedAt: row.deleted_at };
}

async function updateMessage(id, body) {
  await query(
    `INSERT INTO message_edits (message_id, body)
     SELECT id, body FROM messages WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  await query(`UPDATE messages SET body = $2, edited_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id, body]);
}

async function edits(messageId) {
  const result = await query(
    `SELECT body, edited_at FROM message_edits WHERE message_id = $1 ORDER BY edited_at`,
    [messageId],
  );
  return result.rows.map((row) => ({ body: row.body, editedAt: iso(row.edited_at) }));
}

async function softDeleteMessage(id) {
  await query(`UPDATE messages SET deleted_at = NOW(), body = '' WHERE id = $1`, [id]);
  await query(`DELETE FROM message_pins WHERE message_id = $1`, [id]);
}

async function toggleReaction(messageId, userId, emoji) {
  const existing = await query(
    `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3 RETURNING id`,
    [messageId, userId, emoji],
  );
  if (!existing.rows[0]) {
    await query(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1,$2,$3)`,
      [messageId, userId, emoji],
    );
  }
}

async function markRead(conversationId, userId, messageId) {
  await query(
    `UPDATE conversation_members SET last_read_at = NOW() WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
  if (messageId) {
    await query(
      `INSERT INTO message_reads (message_id, user_id) VALUES ($1,$2)
       ON CONFLICT (message_id, user_id) DO UPDATE SET read_at = NOW()`,
      [messageId, userId],
    );
  }
}

async function markUnread(conversationId, userId) {
  await query(
    `UPDATE conversation_members SET last_read_at = NULL WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId],
  );
}

async function pin(conversationId, messageId, userId) {
  await query(
    `INSERT INTO message_pins (conversation_id, message_id, pinned_by) VALUES ($1,$2,$3)
     ON CONFLICT (conversation_id, message_id) DO NOTHING`,
    [conversationId, messageId, userId],
  );
}

async function unpin(conversationId, messageId) {
  await query(`DELETE FROM message_pins WHERE conversation_id = $1 AND message_id = $2`, [conversationId, messageId]);
}

async function setMemberRole(conversationId, userId, role) {
  await query(
    `UPDATE conversation_members SET role = $3 WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId, role],
  );
}

async function removeMember(conversationId, userId) {
  await query(`DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`, [conversationId, userId]);
}

async function memberIds(conversationId) {
  const result = await query(`SELECT user_id FROM conversation_members WHERE conversation_id = $1`, [conversationId]);
  return result.rows.map((row) => row.user_id);
}

async function markDelivered(messageId) {
  await query(`UPDATE messages SET delivered_at = COALESCE(delivered_at, NOW()) WHERE id = $1`, [messageId]);
}

async function touchConversation(conversationId) {
  await query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [conversationId]);
}

async function activity(input) {
  await query(
    `INSERT INTO message_activity (actor_id, action, conversation_id, message_id, thread_id, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.actorId || null, input.action, input.conversationId || null, input.messageId || null, input.threadId || null, input.comment || ''],
  );
}

async function attachmentFile(id, userId) {
  const result = await query(
    `SELECT a.file_name, a.stored_name, a.mime_type
     FROM message_attachments a
     JOIN messages m ON m.id = a.message_id
     JOIN conversation_members mem ON mem.conversation_id = m.conversation_id AND mem.user_id = $2
     WHERE a.id = $1`,
    [id, userId],
  );
  return result.rows[0] || null;
}

async function search(userId, text) {
  const like = `%${text}%`;
  const messagesResult = await query(
    `SELECT m.id, m.body, m.created_at, m.conversation_id, c.type, c.name, u.full_name
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN conversation_members mem ON mem.conversation_id = c.id AND mem.user_id = $1
     LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.deleted_at IS NULL AND m.body ILIKE $2
     ORDER BY m.created_at DESC LIMIT 20`,
    [userId, like],
  );
  const threads = await query(
    `SELECT t.id, t.title, t.body, t.created_at, u.full_name, 'THREAD' AS kind
     FROM forum_threads t
     LEFT JOIN users u ON u.id = t.author_id
     WHERE t.title ILIKE $1 OR t.body ILIKE $1
     ORDER BY t.last_activity_at DESC LIMIT 10`,
    [like],
  );
  const replies = await query(
    `SELECT r.id, r.thread_id, r.body, r.created_at, u.full_name, th.title
     FROM forum_replies r
     JOIN forum_threads th ON th.id = r.thread_id
     LEFT JOIN users u ON u.id = r.author_id
     WHERE r.deleted_at IS NULL AND r.body ILIKE $1
     ORDER BY r.created_at DESC LIMIT 10`,
    [like],
  );
  return {
    messages: messagesResult.rows.map((row) => ({
      kind: row.type,
      id: row.id,
      conversationId: row.conversation_id,
      title: row.name || row.full_name || 'Direct message',
      sender: row.full_name || '',
      snippet: row.body,
      createdAt: iso(row.created_at),
    })),
    threads: threads.rows.map((row) => ({
      kind: 'THREAD',
      id: row.id,
      title: row.title,
      sender: row.full_name || '',
      snippet: row.body,
      createdAt: iso(row.created_at),
    })),
    replies: replies.rows.map((row) => ({
      kind: 'REPLY',
      id: row.id,
      threadId: row.thread_id,
      title: row.title,
      sender: row.full_name || '',
      snippet: row.body,
      createdAt: iso(row.created_at),
    })),
  };
}

async function unreadCount(userId) {
  const result = await query(
    `SELECT
      (SELECT COUNT(*) FROM conversations c
        JOIN conversation_members me ON me.conversation_id = c.id AND me.user_id = $1
        JOIN LATERAL (
          SELECT created_at, sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
        ) last ON TRUE
        WHERE last.sender_id IS DISTINCT FROM $1
          AND (me.last_read_at IS NULL OR last.created_at > me.last_read_at)
      ) AS conversations,
      (SELECT COUNT(*) FROM forum_follows f
        JOIN forum_threads t ON t.id = f.thread_id
        WHERE f.user_id = $1 AND (f.last_read_at IS NULL OR t.last_activity_at > f.last_read_at)
          AND t.author_id IS DISTINCT FROM $1
      ) AS threads`,
    [userId],
  );
  const row = result.rows[0];
  return (Number(row.conversations) || 0) + (Number(row.threads) || 0);
}

async function upsertPresence(userId, status) {
  await query(
    `INSERT INTO user_presence (user_id, status, last_seen_at) VALUES ($1,$2,NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = EXCLUDED.status, last_seen_at = NOW()`,
    [userId, status],
  );
}

async function presenceRows() {
  const result = await query(
    `SELECT p.user_id, p.status, p.last_seen_at, u.full_name, u.designation, t.name AS team_name
     FROM user_presence p
     JOIN users u ON u.id = p.user_id AND u.is_active = TRUE
     LEFT JOIN LATERAL (
       SELECT tm.team_id FROM team_members tm
       JOIN teams tt ON tt.id = tm.team_id AND tt.status = 'ACTIVE'
       WHERE tm.user_id = u.id AND tm.status = 'ACTIVE' ORDER BY tt.name LIMIT 1
     ) membership ON TRUE
     LEFT JOIN teams t ON t.id = membership.team_id
     ORDER BY CASE p.status WHEN 'ONLINE' THEN 0 WHEN 'IDLE' THEN 1 ELSE 2 END, u.full_name`,
  );
  return result.rows.map((row) => ({
    id: row.user_id,
    status: row.status,
    lastSeenAt: iso(row.last_seen_at),
    name: row.full_name,
    designation: row.designation || '',
    teamName: row.team_name || '',
  }));
}

async function listThreads({ category, teamId, tag, text, before, limit }) {
  const params = [];
  const where = [];
  if (category) {
    params.push(category);
    where.push(`t.category = $${params.length}`);
  }
  if (teamId) {
    params.push(teamId);
    where.push(`t.team_id = $${params.length}`);
  }
  if (tag) {
    params.push(tag);
    where.push(`EXISTS (
      SELECT 1 FROM forum_thread_tags tt JOIN forum_tags g ON g.id = tt.tag_id
      WHERE tt.thread_id = t.id AND g.name ILIKE $${params.length}
    )`);
  }
  if (text) {
    params.push(`%${text}%`);
    where.push(`(t.title ILIKE $${params.length} OR t.body ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  if (before) {
    params.push(before);
    where.push(`t.last_activity_at < $${params.length}`);
  }
  params.push(limit);
  const result = await query(
    `SELECT t.*, u.full_name, u.designation, p.title AS project_title, tm.name AS team_name,
        (SELECT COUNT(*) FROM forum_replies r WHERE r.thread_id = t.id AND r.deleted_at IS NULL) AS replies,
        (SELECT COUNT(DISTINCT author_id) FROM forum_replies r WHERE r.thread_id = t.id AND r.author_id IS NOT NULL) AS participants
     FROM forum_threads t
     LEFT JOIN users u ON u.id = t.author_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN teams tm ON tm.id = t.team_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.last_activity_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows.map(mapThread);
}

function mapThread(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    category: row.category,
    status: row.status,
    authorId: row.author_id,
    authorName: row.full_name || 'Former member',
    designation: row.designation || '',
    projectId: row.project_id,
    projectTitle: row.project_title || '',
    teamId: row.team_id,
    teamName: row.team_name || '',
    views: Number(row.view_count) || 0,
    replies: Number(row.replies) || 0,
    participants: Number(row.participants) || 0,
    lastActivityAt: iso(row.last_activity_at),
    createdAt: iso(row.created_at),
  };
}

async function threadTags(ids) {
  if (!ids.length) return [];
  const result = await query(
    `SELECT tt.thread_id, g.name FROM forum_thread_tags tt
     JOIN forum_tags g ON g.id = tt.tag_id
     WHERE tt.thread_id = ANY($1::uuid[]) ORDER BY g.name`,
    [ids],
  );
  return result.rows.map((row) => ({ threadId: row.thread_id, name: row.name }));
}

async function tags() {
  const result = await query(`SELECT name FROM forum_tags ORDER BY name`);
  return result.rows.map((row) => row.name);
}

async function upsertTags(client, names) {
  const ids = [];
  for (const name of names) {
    const result = await client.query(
      `INSERT INTO forum_tags (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [name],
    );
    ids.push(result.rows[0].id);
  }
  return ids;
}

async function insertThread(client, input) {
  const result = await client.query(
    `INSERT INTO forum_threads (title, body, category, status, author_id, project_id, team_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.title, input.body, input.category, input.status, input.authorId, input.projectId || null, input.teamId || null],
  );
  return result.rows[0].id;
}

async function linkTags(client, threadId, tagIds) {
  for (const tagId of tagIds) {
    await client.query(`INSERT INTO forum_thread_tags (thread_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [threadId, tagId]);
  }
}

async function findThread(id) {
  const result = await query(
    `SELECT t.*, u.full_name, u.designation, p.title AS project_title, tm.name AS team_name,
        (SELECT COUNT(*) FROM forum_replies r WHERE r.thread_id = t.id AND r.deleted_at IS NULL) AS replies,
        (SELECT COUNT(DISTINCT author_id) FROM forum_replies r WHERE r.thread_id = t.id AND r.author_id IS NOT NULL) AS participants
     FROM forum_threads t
     LEFT JOIN users u ON u.id = t.author_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN teams tm ON tm.id = t.team_id
     WHERE t.id = $1`,
    [id],
  );
  return result.rows[0] ? mapThread(result.rows[0]) : null;
}

async function recordView(threadId, userId) {
  const inserted = await query(
    `INSERT INTO forum_views (thread_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING thread_id`,
    [threadId, userId],
  );
  if (inserted.rows[0]) await query(`UPDATE forum_threads SET view_count = view_count + 1 WHERE id = $1`, [threadId]);
}

async function replies(threadId) {
  const result = await query(
    `SELECT r.*, u.full_name, u.designation
     FROM forum_replies r
     LEFT JOIN users u ON u.id = r.author_id
     WHERE r.thread_id = $1
     ORDER BY r.created_at`,
    [threadId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    threadId: row.thread_id,
    authorId: row.author_id,
    authorName: row.full_name || 'Former member',
    designation: row.designation || '',
    parentReplyId: row.parent_reply_id,
    body: row.deleted_at ? '' : row.body,
    deleted: Boolean(row.deleted_at),
    editedAt: iso(row.edited_at),
    createdAt: iso(row.created_at),
  }));
}

async function replyReactions(replyIds) {
  if (!replyIds.length) return [];
  const result = await query(
    `SELECT reply_id, user_id, emoji FROM forum_reactions WHERE reply_id = ANY($1::uuid[])`,
    [replyIds],
  );
  return result.rows.map((row) => ({ replyId: row.reply_id, userId: row.user_id, emoji: row.emoji }));
}

async function findReply(id) {
  const result = await query(`SELECT * FROM forum_replies WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? { id: row.id, threadId: row.thread_id, authorId: row.author_id, parentReplyId: row.parent_reply_id, deleted: Boolean(row.deleted_at) } : null;
}

async function insertReply(client, input) {
  const result = await client.query(
    `INSERT INTO forum_replies (thread_id, author_id, parent_reply_id, body) VALUES ($1,$2,$3,$4) RETURNING id`,
    [input.threadId, input.authorId, input.parentReplyId || null, input.body],
  );
  await client.query(`UPDATE forum_threads SET last_activity_at = NOW() WHERE id = $1`, [input.threadId]);
  return result.rows[0].id;
}

async function updateReply(id, body) {
  await query(`UPDATE forum_replies SET body = $2, edited_at = NOW() WHERE id = $1 AND deleted_at IS NULL`, [id, body]);
}

async function deleteReply(id) {
  await query(`UPDATE forum_replies SET deleted_at = NOW(), body = '' WHERE id = $1`, [id]);
}

async function setThreadStatus(id, status) {
  await query(`UPDATE forum_threads SET status = $2, last_activity_at = NOW() WHERE id = $1`, [id, status]);
}

async function updateThread(id, title, body) {
  await query(`UPDATE forum_threads SET title = $2, body = $3 WHERE id = $1`, [id, title, body]);
}

async function follow(threadId, userId, on) {
  if (on) {
    await query(
      `INSERT INTO forum_follows (thread_id, user_id, last_read_at) VALUES ($1,$2,NOW())
       ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = NOW()`,
      [threadId, userId],
    );
  } else {
    await query(`DELETE FROM forum_follows WHERE thread_id = $1 AND user_id = $2`, [threadId, userId]);
  }
}

async function isFollowing(threadId, userId) {
  const result = await query(`SELECT 1 FROM forum_follows WHERE thread_id = $1 AND user_id = $2`, [threadId, userId]);
  return Boolean(result.rows[0]);
}

async function followerIds(threadId) {
  const result = await query(`SELECT user_id FROM forum_follows WHERE thread_id = $1`, [threadId]);
  return result.rows.map((row) => row.user_id);
}

async function toggleReplyReaction(replyId, userId, emoji) {
  const existing = await query(
    `DELETE FROM forum_reactions WHERE reply_id = $1 AND user_id = $2 AND emoji = $3 RETURNING id`,
    [replyId, userId, emoji],
  );
  if (!existing.rows[0]) {
    await query(`INSERT INTO forum_reactions (reply_id, user_id, emoji) VALUES ($1,$2,$3)`, [replyId, userId, emoji]);
  }
}

async function insertForumAttachment(client, input) {
  await client.query(
    `INSERT INTO forum_attachments (thread_id, file_name, stored_name, mime_type, size_bytes)
     VALUES ($1,$2,$3,$4,$5)`,
    [input.threadId, input.name, input.storedName, input.mimeType, input.size],
  );
}

async function forumFiles(threadId) {
  const result = await query(
    `SELECT id, file_name, mime_type, size_bytes FROM forum_attachments WHERE thread_id = $1`,
    [threadId],
  );
  return result.rows.map((row) => ({ id: row.id, name: row.file_name, mimeType: row.mime_type, size: row.size_bytes }));
}

async function forumFile(id) {
  const result = await query(`SELECT file_name, stored_name, mime_type FROM forum_attachments WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function userActive(id) {
  const result = await query(`SELECT id, full_name, is_active FROM users WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? { id: row.id, name: row.full_name, active: row.is_active } : null;
}

module.exports = {
  directory,
  teams,
  projects,
  tasks,
  findDirect,
  insertConversation,
  addMember,
  directList,
  groupList,
  conversationFor,
  members,
  messages,
  attachmentsFor,
  reactionsFor,
  pins,
  insertMessage,
  insertAttachment,
  findMessage,
  updateMessage,
  edits,
  softDeleteMessage,
  toggleReaction,
  markRead,
  markUnread,
  pin,
  unpin,
  setMemberRole,
  removeMember,
  memberIds,
  markDelivered,
  touchConversation,
  activity,
  attachmentFile,
  search,
  unreadCount,
  upsertPresence,
  presenceRows,
  listThreads,
  threadTags,
  tags,
  upsertTags,
  insertThread,
  linkTags,
  findThread,
  recordView,
  replies,
  replyReactions,
  findReply,
  insertReply,
  updateReply,
  deleteReply,
  setThreadStatus,
  updateThread,
  follow,
  isFollowing,
  followerIds,
  toggleReplyReaction,
  insertForumAttachment,
  forumFiles,
  forumFile,
  userActive,
};
