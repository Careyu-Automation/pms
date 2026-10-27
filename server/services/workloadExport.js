const { pdf } = require('./timeExport');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function excel(data) {
  const columns = ['Employee', 'Team', 'Designation', 'Capacity', 'Assigned', 'Logged', 'Remaining', 'Utilization', 'Open Tasks', 'Overdue', 'Status'];
  const rows = data.employees.map((person) => [
    person.name,
    person.teamName,
    person.designation,
    person.capacity,
    person.assigned,
    person.logged,
    person.remaining,
    person.utilization == null ? '' : `${person.utilization}%`,
    person.openTasks,
    person.overdue,
    person.status,
  ]);
  const body = [columns, ...rows].map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Workload"><Table>${body}</Table></Worksheet>
</Workbook>`;
}

function pdfReport(data) {
  const summary = data.summary;
  const lines = [
    'CareYu Automation',
    'Workload Report',
    `${data.period.start} to ${data.period.end}`,
    `People ${summary.people}  Assigned ${summary.assigned}h  Logged ${summary.logged}h`,
    `Available ${summary.available}h  Overloaded ${summary.overloaded}  Under capacity ${summary.underutilized}`,
    `Generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Employee | Team | Capacity | Assigned | Logged | Remaining | Utilization | Open | Overdue | Status',
  ];
  data.employees.forEach((person) => {
    lines.push(`${person.name} | ${person.teamName || '—'} | ${person.capacity}h | ${person.assigned}h | ${person.logged}h | ${person.remaining}h | ${person.utilization == null ? '—' : `${person.utilization}%`} | ${person.openTasks} | ${person.overdue} | ${person.status}`);
  });
  const overloaded = data.employees.filter((person) => person.assigned > person.capacity);
  lines.push('');
  lines.push(overloaded.length ? 'Overloaded employees' : 'No employees are currently over capacity.');
  overloaded.forEach((person) => {
    lines.push(`${person.name}: ${person.assigned}h assigned, ${person.capacity}h capacity, +${Math.round((person.assigned - person.capacity) * 10) / 10}h`);
  });
  if (!data.employees.length) lines.push('No workload data for this period.');
  return pdf('Workload Report', lines);
}

module.exports = { excel, pdfReport };
