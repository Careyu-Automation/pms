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

const ORDERS = {
  newest: 'c.created_at DESC',
  oldest: 'c.created_at ASC',
  visit: 'c.visit_date ASC NULLS LAST, c.created_at DESC',
  completion: `((SELECT COUNT(*) FILTER (WHERE completed) FROM checklist_items i WHERE i.checklist_id = c.id)::float / NULLIF((SELECT COUNT(*) FROM checklist_items i WHERE i.checklist_id = c.id), 0)) DESC NULLS LAST, c.created_at DESC`,
};

function mapItem(row) {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    title: row.title,
    completed: row.completed,
    sortOrder: row.sort_order,
  };
}

function mapChecklist(row, items, viewerIds) {
  const total = Number(row.item_count) || items.length;
  const completed = Number(row.completed_count) || items.filter((item) => item.completed).length;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    title: row.title,
    note: row.note || '',
    visitDate: isoDate(row.visit_date),
    visibility: row.visibility,
    viewerIds,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items,
    completedCount: completed,
    totalCount: total,
    progress: total ? Math.round((completed / total) * 100) : 0,
  };
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

function visibilitySql(isAdmin, userId, params) {
  if (isAdmin) return 'TRUE';
  params.push(userId);
  const slot = `$${params.length}`;
  return `(c.employee_id = ${slot} OR c.created_by = ${slot} OR c.visibility = 'EVERYONE' OR EXISTS (
    SELECT 1 FROM checklist_visibility v WHERE v.checklist_id = c.id AND v.user_id = ${slot}
  ))`;
}

async function hydrate(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [items, viewers] = await Promise.all([
    query(
      `SELECT * FROM checklist_items WHERE checklist_id = ANY($1::uuid[]) ORDER BY sort_order, created_at`,
      [ids],
    ),
    query(
      `SELECT checklist_id, user_id FROM checklist_visibility WHERE checklist_id = ANY($1::uuid[])`,
      [ids],
    ),
  ]);
  const itemsByChecklist = new Map();
  items.rows.forEach((row) => {
    const list = itemsByChecklist.get(row.checklist_id) || [];
    list.push(mapItem(row));
    itemsByChecklist.set(row.checklist_id, list);
  });
  const viewersByChecklist = new Map();
  viewers.rows.forEach((row) => {
    const list = viewersByChecklist.get(row.checklist_id) || [];
    list.push(row.user_id);
    viewersByChecklist.set(row.checklist_id, list);
  });
  return rows.map((row) => mapChecklist(row, itemsByChecklist.get(row.id) || [], viewersByChecklist.get(row.id) || []));
}

async function list(filters) {
  const params = [];
  const where = [visibilitySql(filters.isAdmin, filters.userId, params)];
  if (filters.scope === 'mine') {
    params.push(filters.userId);
    where.push(`c.employee_id = $${params.length}`);
  }
  if (filters.scope === 'selected') {
    params.push(filters.employeeIds);
    where.push(`c.employee_id = ANY($${params.length}::uuid[])`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(c.title ILIKE $${params.length} OR c.note ILIKE $${params.length} OR employee.full_name ILIKE $${params.length})`);
  }
  const order = ORDERS[filters.sort] || ORDERS.newest;
  const result = await query(
    `SELECT c.*, employee.full_name AS employee_name,
      (SELECT COUNT(*)::int FROM checklist_items i WHERE i.checklist_id = c.id) AS item_count,
      (SELECT COUNT(*)::int FROM checklist_items i WHERE i.checklist_id = c.id AND i.completed) AS completed_count
     FROM checklists c
     JOIN users employee ON employee.id = c.employee_id
     WHERE ${where.join(' AND ')}
     ORDER BY ${order}`,
    params,
  );
  return hydrate(result.rows);
}

async function findById(id, access) {
  const params = [id];
  const visible = visibilitySql(access.isAdmin, access.userId, params);
  const result = await query(
    `SELECT c.*, employee.full_name AS employee_name,
      (SELECT COUNT(*)::int FROM checklist_items i WHERE i.checklist_id = c.id) AS item_count,
      (SELECT COUNT(*)::int FROM checklist_items i WHERE i.checklist_id = c.id AND i.completed) AS completed_count
     FROM checklists c
     JOIN users employee ON employee.id = c.employee_id
     WHERE c.id = $1 AND ${visible}`,
    params,
  );
  const rows = await hydrate(result.rows);
  return rows[0] || null;
}

async function insertChecklist(client, input) {
  const result = await client.query(
    `INSERT INTO checklists (employee_id, title, note, visit_date, visibility, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.employeeId, input.title, input.note, input.visitDate, input.visibility, input.createdById],
  );
  return result.rows[0].id;
}

async function updateChecklist(client, id, input) {
  await client.query(
    `UPDATE checklists
     SET employee_id = $2, title = $3, note = $4, visit_date = $5, visibility = $6
     WHERE id = $1`,
    [id, input.employeeId, input.title, input.note, input.visitDate, input.visibility],
  );
}

async function syncItems(client, checklistId, items) {
  const existing = await client.query('SELECT id, completed FROM checklist_items WHERE checklist_id = $1', [checklistId]);
  const kept = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.id && existing.rows.some((row) => row.id === item.id)) {
      kept.add(item.id);
      await client.query(
        `UPDATE checklist_items SET title = $3, sort_order = $4 WHERE checklist_id = $1 AND id = $2`,
        [checklistId, item.id, item.title, index],
      );
    } else {
      const inserted = await client.query(
        `INSERT INTO checklist_items (checklist_id, title, completed, sort_order) VALUES ($1,$2,FALSE,$3) RETURNING id`,
        [checklistId, item.title, index],
      );
      kept.add(inserted.rows[0].id);
    }
  }
  const removed = existing.rows.filter((row) => !kept.has(row.id)).map((row) => row.id);
  if (removed.length) {
    await client.query('DELETE FROM checklist_items WHERE checklist_id = $1 AND id = ANY($2::uuid[])', [checklistId, removed]);
  }
}

async function replaceViewers(client, checklistId, viewerIds) {
  await client.query('DELETE FROM checklist_visibility WHERE checklist_id = $1', [checklistId]);
  for (const userId of viewerIds) {
    await client.query(
      `INSERT INTO checklist_visibility (checklist_id, user_id) VALUES ($1,$2) ON CONFLICT (checklist_id, user_id) DO NOTHING`,
      [checklistId, userId],
    );
  }
}

async function addItem(checklistId, title) {
  const result = await query(
    `INSERT INTO checklist_items (checklist_id, title, sort_order)
     VALUES ($1, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM checklist_items WHERE checklist_id = $1), 0))
     RETURNING *`,
    [checklistId, title],
  );
  return mapItem(result.rows[0]);
}

async function updateItem(checklistId, itemId, title) {
  const result = await query(
    `UPDATE checklist_items SET title = $3 WHERE checklist_id = $1 AND id = $2 RETURNING *`,
    [checklistId, itemId, title],
  );
  return result.rows[0] ? mapItem(result.rows[0]) : null;
}

async function deleteItem(checklistId, itemId) {
  const result = await query(
    'DELETE FROM checklist_items WHERE checklist_id = $1 AND id = $2 RETURNING id, title',
    [checklistId, itemId],
  );
  return result.rows[0] || null;
}

async function toggleItem(checklistId, itemId) {
  const result = await query(
    `UPDATE checklist_items SET completed = NOT completed
     WHERE checklist_id = $1 AND id = $2
     RETURNING *`,
    [checklistId, itemId],
  );
  return result.rows[0] ? mapItem(result.rows[0]) : null;
}

async function removeChecklist(id) {
  const result = await query('DELETE FROM checklists WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

async function addActivity(checklistId, actorId, action, client = null) {
  const runner = client ? client.query.bind(client) : query;
  await runner(
    'INSERT INTO checklist_activity (checklist_id, actor_id, action) VALUES ($1,$2,$3)',
    [checklistId, actorId, action],
  );
}

module.exports = {
  withTransaction,
  list,
  findById,
  insertChecklist,
  updateChecklist,
  syncItems,
  replaceViewers,
  addItem,
  updateItem,
  deleteItem,
  toggleItem,
  removeChecklist,
  addActivity,
};
