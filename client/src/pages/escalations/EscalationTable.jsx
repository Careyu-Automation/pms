import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EscalationPriorityBadge, EscalationStatusBadge } from './EscalationBadges';
import { stamp } from './model';

export function EscalationTable({ rows, sort, onSort, canDelete, onEdit, onAssign, onStatus, onMore }) {
  const [menu, setMenu] = useState('');
  return (
    <div className="esc-table-wrap">
      <table className="esc-table">
        <thead>
          <tr>
            <th>Escalation ID</th>
            <th>Title</th>
            <th>Project</th>
            <th>Customer</th>
            <th>Raised By</th>
            <th>Assigned To</th>
            <th>Team</th>
            <th>Type</th>
            <th>Priority</th>
            <th>Status</th>
            <th><button type="button" onClick={() => onSort('due')}>Due Date</button></th>
            <th><button type="button" onClick={() => onSort('age')}>Age</button></th>
            <th><button type="button" onClick={() => onSort('updated')}>Updated</button></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td><Link to={`/escalations/${row.id}`}>{row.number}</Link></td>
              <td><Link to={`/escalations/${row.id}`}>{row.title}</Link></td>
              <td>{row.projectTitle || '—'}</td>
              <td>{row.customerName || '—'}</td>
              <td>{row.raisedByName || '—'}</td>
              <td>{row.assignedToName || '—'}</td>
              <td>{row.teamName || '—'}</td>
              <td>{row.typeLabel}</td>
              <td><EscalationPriorityBadge priority={row.priority} /></td>
              <td><EscalationStatusBadge status={row.status} overdue={row.overdue} /></td>
              <td>{row.dueDate ? stamp(row.dueDate) : '—'}</td>
              <td>{row.age}</td>
              <td>{stamp(row.updatedAt)}</td>
              <td className="esc-actions">
                <Link to={`/escalations/${row.id}`}>View</Link>
                <button type="button" onClick={() => onEdit(row)}>Edit</button>
                <button type="button" onClick={() => onAssign(row)}>Assign</button>
                <button type="button" onClick={() => onStatus(row)}>Change Status</button>
                <button type="button" onClick={() => setMenu(menu === row.id ? '' : row.id)}>More</button>
                {menu === row.id ? (
                  <div className="esc-menu" role="menu">
                    <button type="button" onClick={() => { setMenu(''); onMore('duplicate', row); }}>Duplicate</button>
                    <button type="button" onClick={() => { setMenu(''); onMore('comment', row); }}>Add Comment</button>
                    <button type="button" onClick={() => { setMenu(''); onMore('escalate', row); }}>Escalate Further</button>
                    <button type="button" onClick={() => { setMenu(''); onMore('close', row); }}>Close</button>
                    {canDelete ? <button type="button" onClick={() => { setMenu(''); onMore('delete', row); }}>Delete</button> : null}
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="esc-cards">
        {rows.map((row) => (
          <li key={row.id}>
            <Link to={`/escalations/${row.id}`}><strong>{row.number}</strong> {row.title}</Link>
            <p>{row.projectTitle || 'No project'} · {row.teamName || 'No team'} · {row.assignedToName || 'Unassigned'}</p>
            <EscalationPriorityBadge priority={row.priority} />
            <EscalationStatusBadge status={row.status} overdue={row.overdue} />
            <span>{row.age}</span>
          </li>
        ))}
      </ul>
      <p className="esc-sort-note">Sorted by {sort === 'created' ? 'created date' : sort === 'updated' ? 'updated date' : sort === 'due' ? 'due date' : sort === 'age' ? 'age' : sort === 'status' ? 'status' : 'highest priority, then oldest unresolved'}.</p>
    </div>
  );
}
