const { pool, query } = require('./index');

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return '';
}

function num(value) {
  return Number(value) || 0;
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function nextNumber(client, prefix, year) {
  const bucket = `${prefix}-${year}`;
  const result = await client.query(
    `INSERT INTO leave_number_counters (bucket, last_value) VALUES ($1, 1)
     ON CONFLICT (bucket) DO UPDATE SET last_value = leave_number_counters.last_value + 1
     RETURNING last_value`,
    [bucket],
  );
  return `${prefix}-${year}-${String(result.rows[0].last_value).padStart(4, '0')}`;
}

async function calendar() {
  const [settings, holidays] = await Promise.all([
    query('SELECT weekend_days FROM organization_calendar WHERE id = 1'),
    query('SELECT holiday_date, name, is_working_day FROM organization_holidays ORDER BY holiday_date'),
  ]);
  return {
    weekendDays: settings.rows[0]?.weekend_days || [0, 6],
    holidays: holidays.rows.map((row) => ({
      date: isoDate(row.holiday_date),
      name: row.name,
      isWorkingDay: Boolean(row.is_working_day),
    })),
  };
}

async function addHoliday(date, name, isWorkingDay) {
  const result = await query(
    `INSERT INTO organization_holidays (holiday_date, name, is_working_day)
     VALUES ($1, $2, $3)
     ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name, is_working_day = EXCLUDED.is_working_day
     RETURNING id, holiday_date, name, is_working_day`,
    [date, name, isWorkingDay],
  );
  const row = result.rows[0];
  return { id: row.id, date: isoDate(row.holiday_date), name: row.name, isWorkingDay: Boolean(row.is_working_day) };
}

async function listTypes(activeOnly) {
  const result = await query(
    `SELECT * FROM leave_types ${activeOnly ? 'WHERE is_active = TRUE' : ''} ORDER BY name`,
  );
  return result.rows.map(mapType);
}

function mapType(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || '',
    defaultAnnualAllocation: num(row.default_annual_allocation),
    isActive: Boolean(row.is_active),
  };
}

async function findType(id) {
  const result = await query('SELECT * FROM leave_types WHERE id = $1', [id]);
  return result.rows[0] ? mapType(result.rows[0]) : null;
}

const PRIMARY_LEAVE_CODE = 'CASUAL';
const PRIMARY_LEAVE_ENTITLEMENT = 12;

async function ensureBalances(userId, year) {
  await query(
    `UPDATE leave_types
     SET default_annual_allocation = $1
     WHERE code = $2 AND default_annual_allocation IS DISTINCT FROM $1`,
    [PRIMARY_LEAVE_ENTITLEMENT, PRIMARY_LEAVE_CODE],
  );
  await query(
    `INSERT INTO leave_balances (user_id, leave_type_id, year, allocated_days)
     SELECT $1, t.id, $2, t.default_annual_allocation
     FROM leave_types t
     WHERE t.is_active = TRUE
     ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
    [userId, year],
  );
  // Keep the displayed annual category at the 12-day entitlement without wiping history.
  await query(
    `UPDATE leave_balances b
     SET allocated_days = t.default_annual_allocation
     FROM leave_types t
     WHERE b.leave_type_id = t.id
       AND b.user_id = $1
       AND b.year = $2
       AND t.code = $3
       AND b.allocated_days IS DISTINCT FROM t.default_annual_allocation`,
    [userId, year, PRIMARY_LEAVE_CODE],
  );
}

async function balances(userId, year) {
  await ensureBalances(userId, year);
  const result = await query(
    `SELECT b.*, t.name, t.code
     FROM leave_balances b
     JOIN leave_types t ON t.id = b.leave_type_id
     WHERE b.user_id = $1 AND b.year = $2
     ORDER BY t.name`,
    [userId, year],
  );
  return result.rows.map((row) => {
    const allocated = num(row.allocated_days);
    const used = num(row.used_days);
    const pending = num(row.pending_days);
    return {
      id: row.id,
      userId: row.user_id,
      leaveTypeId: row.leave_type_id,
      name: row.name,
      code: row.code,
      year: row.year,
      allocatedDays: allocated,
      usedDays: used,
      pendingDays: pending,
      // Pending requests do not reduce remaining balance; approval validates against remaining.
      availableDays: Math.max(0, allocated - used),
    };
  });
}

async function adjustPending(client, userId, leaveTypeId, year, delta) {
  await client.query(
    `UPDATE leave_balances
     SET pending_days = pending_days + $4
     WHERE user_id = $1 AND leave_type_id = $2 AND year = $3`,
    [userId, leaveTypeId, year, delta],
  );
}

async function approveBalance(client, userId, leaveTypeId, year, days) {
  await client.query(
    `UPDATE leave_balances
     SET pending_days = pending_days - $4, used_days = used_days + $4
     WHERE user_id = $1 AND leave_type_id = $2 AND year = $3`,
    [userId, leaveTypeId, year, days],
  );
}

async function setAllocation(userId, leaveTypeId, year, allocatedDays) {
  await ensureBalances(userId, year);
  const result = await query(
    `UPDATE leave_balances SET allocated_days = $4
     WHERE user_id = $1 AND leave_type_id = $2 AND year = $3
     RETURNING allocated_days`,
    [userId, leaveTypeId, year, allocatedDays],
  );
  return result.rows[0] || null;
}

function mapLeave(row) {
  return {
    id: row.id,
    kind: 'LEAVE',
    requestNumber: row.request_number,
    userId: row.user_id,
    employeeName: row.employee_name || '',
    teamId: row.team_id,
    teamName: row.team_name || '',
    leaveTypeId: row.leave_type_id,
    typeName: row.type_name || '',
    typeCode: row.type_code || '',
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    durationDays: num(row.duration_days),
    durationType: row.duration_type,
    reason: row.reason || '',
    note: row.note || '',
    attachmentName: row.attachment_name || '',
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name || '',
    reviewedAt: row.reviewed_at,
    approvalComment: row.approval_comment || '',
    rejectionReason: row.rejection_reason || '',
    createdAt: row.created_at,
  };
}

function mapPermission(row) {
  return {
    id: row.id,
    kind: 'PERMISSION',
    requestNumber: row.request_number,
    userId: row.user_id,
    employeeName: row.employee_name || '',
    teamId: row.team_id,
    teamName: row.team_name || '',
    typeName: 'Permission',
    typeCode: 'PERMISSION',
    startDate: isoDate(row.permission_date),
    endDate: isoDate(row.permission_date),
    durationDays: 0,
    durationMinutes: Number(row.duration_minutes) || 0,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason || '',
    note: row.note || '',
    status: row.status,
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by,
    reviewerName: row.reviewer_name || '',
    reviewedAt: row.reviewed_at,
    approvalComment: row.approval_comment || '',
    rejectionReason: row.rejection_reason || '',
    createdAt: row.created_at,
  };
}

const LEAVE_FROM = `
  FROM leave_requests r
  JOIN users u ON u.id = r.user_id
  JOIN leave_types t ON t.id = r.leave_type_id
  LEFT JOIN teams tm ON tm.id = r.team_id
  LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
`;

const PERMISSION_FROM = `
  FROM permission_requests r
  JOIN users u ON u.id = r.user_id
  LEFT JOIN teams tm ON tm.id = r.team_id
  LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
`;

function scopeClause(filters, params) {
  const where = [];
  if (filters.userId) {
    params.push(filters.userId);
    where.push(`r.user_id = $${params.length}`);
  }
  if (filters.teamIds) {
    params.push(filters.teamIds);
    const teamSlot = `$${params.length}`;
    params.push(filters.actorId);
    where.push(`(r.user_id = $${params.length} OR r.user_id IN (
      SELECT m.user_id FROM team_members m WHERE m.status = 'ACTIVE' AND m.team_id = ANY(${teamSlot}::uuid[])
    ))`);
  }
  if (filters.pendingForTeams) {
    params.push(filters.actorId);
    where.push(`r.user_id <> $${params.length}`);
    where.push(`r.status = 'PENDING'`);
    if (!filters.admin) {
      params.push(filters.pendingForTeams);
      where.push(`r.user_id IN (
        SELECT m.user_id FROM team_members m WHERE m.status = 'ACTIVE' AND m.team_id = ANY($${params.length}::uuid[])
      )`);
    }
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`r.status = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`${filters.permission ? 'r.permission_date' : 'r.end_date'} >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`${filters.permission ? 'r.permission_date' : 'r.start_date'} <= $${params.length}`);
  }
  if (filters.leaveTypeId && !filters.permission) {
    params.push(filters.leaveTypeId);
    where.push(`r.leave_type_id = $${params.length}`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`r.team_id = $${params.length}`);
  }
  if (filters.employeeId) {
    params.push(filters.employeeId);
    where.push(`r.user_id = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const slot = `$${params.length}`;
    where.push(filters.permission
      ? `(u.full_name ILIKE ${slot} OR r.reason ILIKE ${slot} OR 'Permission' ILIKE ${slot})`
      : `(u.full_name ILIKE ${slot} OR r.reason ILIKE ${slot} OR t.name ILIKE ${slot})`);
  }
  return where;
}

async function listLeave(filters) {
  const params = [];
  const where = scopeClause({ ...filters, permission: false }, params);
  const result = await query(
    `SELECT r.*, u.full_name AS employee_name, t.name AS type_name, t.code AS type_code,
      tm.name AS team_name, reviewer.full_name AS reviewer_name
     ${LEAVE_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.submitted_at DESC
     LIMIT 300`,
    params,
  );
  return result.rows.map(mapLeave);
}

async function listPermissions(filters) {
  const params = [];
  const where = scopeClause({ ...filters, permission: true }, params);
  const result = await query(
    `SELECT r.*, u.full_name AS employee_name, tm.name AS team_name, reviewer.full_name AS reviewer_name
     ${PERMISSION_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.submitted_at DESC
     LIMIT 300`,
    params,
  );
  return result.rows.map(mapPermission);
}

async function findLeave(id) {
  const result = await query(
    `SELECT r.*, u.full_name AS employee_name, t.name AS type_name, t.code AS type_code,
      tm.name AS team_name, reviewer.full_name AS reviewer_name
     ${LEAVE_FROM} WHERE r.id = $1`,
    [id],
  );
  return result.rows[0] ? mapLeave(result.rows[0]) : null;
}

async function findPermission(id) {
  const result = await query(
    `SELECT r.*, u.full_name AS employee_name, tm.name AS team_name, reviewer.full_name AS reviewer_name
     ${PERMISSION_FROM} WHERE r.id = $1`,
    [id],
  );
  return result.rows[0] ? mapPermission(result.rows[0]) : null;
}

async function leaveOverlap(userId, start, end, exceptId) {
  const result = await query(
    `SELECT id FROM leave_requests
     WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED')
       AND start_date <= $3 AND end_date >= $2
       AND id <> COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000')
     LIMIT 1`,
    [userId, start, end, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function permissionOverlap(userId, start, end, exceptId) {
  const result = await query(
    `SELECT id FROM permission_requests
     WHERE user_id = $1 AND status IN ('PENDING', 'APPROVED')
       AND start_time < $3 AND end_time > $2
       AND id <> COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000')
     LIMIT 1`,
    [userId, start, end, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function primaryTeam(userId) {
  const result = await query(
    `SELECT m.team_id FROM team_members m
     JOIN teams t ON t.id = m.team_id
     WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND t.status = 'ACTIVE'
     ORDER BY t.name LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.team_id || null;
}

async function leadTeamIds(userId) {
  const result = await query(
    `SELECT DISTINCT t.id
     FROM teams t
     LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = $1 AND m.status = 'ACTIVE'
     WHERE t.status = 'ACTIVE' AND (t.lead_id = $1 OR m.role = 'TEAM_LEAD')`,
    [userId],
  );
  return result.rows.map((row) => row.id);
}

async function approverIds(userId) {
  const result = await query(
    `SELECT DISTINCT people.id
     FROM (
       SELECT t.lead_id AS id
       FROM team_members m
       JOIN teams t ON t.id = m.team_id
       WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND t.lead_id IS NOT NULL AND t.lead_id <> $1
       UNION
       SELECT lead.user_id
       FROM team_members m
       JOIN team_members lead ON lead.team_id = m.team_id AND lead.role = 'TEAM_LEAD' AND lead.status = 'ACTIVE'
       WHERE m.user_id = $1 AND m.status = 'ACTIVE' AND lead.user_id <> $1
       UNION
       SELECT u.id
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.is_active = TRUE AND r.code IN ('admin', 'super_admin', 'project_manager', 'management') AND u.id <> $1
     ) people
     WHERE people.id IS NOT NULL`,
    [userId],
  );
  return result.rows.map((row) => row.id);
}

async function insertLeave(client, input) {
  const number = await nextNumber(client, 'LV', input.year);
  const result = await client.query(
    `INSERT INTO leave_requests
      (request_number, user_id, team_id, leave_type_id, start_date, end_date, duration_days, duration_type, reason, note, attachment_name, attachment_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      number, input.userId, input.teamId, input.leaveTypeId, input.startDate, input.endDate,
      input.durationDays, input.durationType, input.reason, input.note, input.attachmentName, input.attachmentPath,
    ],
  );
  return result.rows[0].id;
}

async function insertPermission(client, input) {
  const number = await nextNumber(client, 'PR', input.year);
  const result = await client.query(
    `INSERT INTO permission_requests
      (request_number, user_id, team_id, permission_date, start_time, end_time, duration_minutes, reason, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id`,
    [number, input.userId, input.teamId, input.date, input.startTime, input.endTime, input.durationMinutes, input.reason, input.note],
  );
  return result.rows[0].id;
}

async function reviewLeave(client, id, input) {
  await client.query(
    `UPDATE leave_requests
     SET status = $2, reviewed_by = $3, reviewed_at = NOW(), approval_comment = $4, rejection_reason = $5
     WHERE id = $1`,
    [id, input.status, input.actorId, input.approvalComment || '', input.rejectionReason || ''],
  );
}

async function reviewPermission(client, id, input) {
  await client.query(
    `UPDATE permission_requests
     SET status = $2, reviewed_by = $3, reviewed_at = NOW(), approval_comment = $4, rejection_reason = $5
     WHERE id = $1`,
    [id, input.status, input.actorId, input.approvalComment || '', input.rejectionReason || ''],
  );
}

async function addLeaveHistory(client, requestId, action, actorId, comment) {
  await client.query(
    `INSERT INTO leave_approval_history (leave_request_id, action, action_by, comment) VALUES ($1,$2,$3,$4)`,
    [requestId, action, actorId, comment || ''],
  );
}

async function addPermissionHistory(client, requestId, action, actorId, comment) {
  await client.query(
    `INSERT INTO permission_approval_history (permission_request_id, action, action_by, comment) VALUES ($1,$2,$3,$4)`,
    [requestId, action, actorId, comment || ''],
  );
}

async function addActivity(client, input) {
  const runner = client || { query };
  await runner.query(
    `INSERT INTO leave_activity (user_id, actor_id, leave_request_id, permission_request_id, action, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.userId, input.actorId, input.leaveRequestId || null, input.permissionRequestId || null, input.action, input.comment || ''],
  );
}

async function leaveHistory(requestId) {
  const result = await query(
    `SELECT h.*, u.full_name AS actor_name
     FROM leave_approval_history h
     LEFT JOIN users u ON u.id = h.action_by
     WHERE h.leave_request_id = $1
     ORDER BY h.created_at`,
    [requestId],
  );
  return result.rows.map(mapHistory);
}

async function permissionHistory(requestId) {
  const result = await query(
    `SELECT h.*, u.full_name AS actor_name
     FROM permission_approval_history h
     LEFT JOIN users u ON u.id = h.action_by
     WHERE h.permission_request_id = $1
     ORDER BY h.created_at`,
    [requestId],
  );
  return result.rows.map(mapHistory);
}

function mapHistory(row) {
  return {
    id: row.id,
    action: row.action,
    actionBy: row.action_by,
    actorName: row.actor_name || '',
    comment: row.comment || '',
    createdAt: row.created_at,
  };
}

async function notify(userIds, title, body, link) {
  const ids = [...new Set(userIds.filter(Boolean))];
  for (const userId of ids) {
    await query(
      `INSERT INTO notifications (user_id, title, body, link) VALUES ($1,$2,$3,$4)`,
      [userId, title, body, link || '/leave'],
    );
  }
}

async function listNotifications(userId) {
  const result = await query(
    `SELECT id, title, body, link, read_at, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 30`,
    [userId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

async function markNotification(id, userId) {
  await query(
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId],
  );
}

async function summaryCounts(userId, year, teamScope) {
  const pending = await query(
    `SELECT
      (SELECT COUNT(*) FROM leave_requests WHERE user_id = $1 AND status = 'PENDING') +
      (SELECT COUNT(*) FROM permission_requests WHERE user_id = $1 AND status = 'PENDING') AS pending,
     (SELECT COALESCE(SUM(duration_days), 0) FROM leave_requests
       WHERE user_id = $1 AND status = 'APPROVED' AND EXTRACT(YEAR FROM start_date) = $2) AS approved`,
    [userId, year],
  );
  return {
    pendingRequests: Number(pending.rows[0].pending) || 0,
    approvedDays: num(pending.rows[0].approved),
    teamScope,
  };
}

async function teams() {
  const result = await query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`);
  return result.rows.map((row) => ({ id: row.id, name: row.name }));
}

async function directory(admin, teamIds) {
  if (!admin && !teamIds.length) return [];
  const result = admin
    ? await query(`SELECT id, full_name FROM users WHERE is_active = TRUE ORDER BY full_name`)
    : await query(
      `SELECT DISTINCT u.id, u.full_name
       FROM users u
       JOIN team_members m ON m.user_id = u.id
       WHERE u.is_active = TRUE AND m.status = 'ACTIVE' AND m.team_id = ANY($1::uuid[])
       ORDER BY u.full_name`,
      [teamIds],
    );
  return result.rows.map((row) => ({ id: row.id, fullName: row.full_name }));
}

module.exports = {
  PRIMARY_LEAVE_CODE,
  PRIMARY_LEAVE_ENTITLEMENT,
  withTransaction,
  calendar,
  addHoliday,
  listTypes,
  findType,
  ensureBalances,
  balances,
  adjustPending,
  approveBalance,
  setAllocation,
  listLeave,
  listPermissions,
  findLeave,
  findPermission,
  leaveOverlap,
  permissionOverlap,
  primaryTeam,
  leadTeamIds,
  approverIds,
  insertLeave,
  insertPermission,
  reviewLeave,
  reviewPermission,
  addLeaveHistory,
  addPermissionHistory,
  addActivity,
  leaveHistory,
  permissionHistory,
  notify,
  listNotifications,
  markNotification,
  summaryCounts,
  teams,
  directory,
};
