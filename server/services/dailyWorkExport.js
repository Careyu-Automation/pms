const { STATUS_LABEL } = require('./dailyWork.service');

const COLUMNS = [
  'PERSON', 'PROJECT', 'TASK DESCRIPTION', 'DEPENDENCIES', 'STATUS', 'START DATE', 'TASK DEADLINE',
  'LOGGED HOURS', 'REASON FOR DELAY', 'TEAM', 'WORK TYPE', 'MORNING WORK', 'EVENING WORK',
  'PROGRESS', 'NEXT ACTION', 'PRIORITY', 'REPORT DATE', 'PERIOD',
];

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function excel(rows) {
  const body = [COLUMNS, ...rows.map((row) => {
    const logged = row.loggedHours != null ? Number(row.loggedHours) : (Number(row.hours) || 0) + ((Number(row.minutes) || 0) / 60);
    return [
      row.employeeName,
      row.projectName || 'No project',
      row.description || row.workTitle,
      row.dependencyDetails || 'None',
      STATUS_LABEL[row.status] || row.status,
      row.startDate || '',
      row.deadline || '',
      `${Math.round((logged || 0) * 10) / 10} hrs`,
      row.reasonForDelay || '',
      row.teamName || '',
      row.workTypeName || '',
      row.morningWork || '',
      row.eveningWork || '',
      row.progress == null || row.progress === '' ? '' : `${row.progress}%`,
      row.nextAction || '',
      row.priority || '',
      row.currentDate,
      row.period === 'EVENING' ? 'Evening' : 'Morning',
    ];
  })].map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Daily Work Updates"><Table>${body}</Table></Worksheet>
</Workbook>`;
}

function pdfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrap(text, width) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word.slice(0, width);
    } else current = next;
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function pdf(report) {
  const lines = [
    'CareYu Automation',
    'Daily Work Updates',
    `Date range: ${report.window.from} - ${report.window.to}`,
    `Employee: ${report.employeeName || 'All employees'}`,
    `Activities ${report.summary.activities || 0}  Completed ${report.summary.completed || 0}  In Progress ${report.summary.inProgress || 0}  Blocked ${report.summary.blocked || 0}  Hours ${report.summary.hoursLabel || '0h'}`,
    '',
  ];
  report.rows.forEach((row) => {
    lines.push(`${row.currentDate}  ${row.employeeName}  ${row.workTypeName || ''}  ${row.workTitle || row.title || ''}`);
    lines.push(`Project: ${row.projectName || 'No project'}   Product: ${row.productName || '—'}   ${STATUS_LABEL[row.status] || row.status}`);
    wrap(row.description, 90).forEach((line) => lines.push(line));
    if (row.dependencyText) lines.push(`Dependencies: ${row.dependencyText}`);
    if (row.reasonForDelay) lines.push(`Reason: ${row.reasonForDelay}`);
    lines.push('');
  });
  if (!report.rows.length) lines.push('No daily work updates for this filter.');

  const pages = [];
  for (let index = 0; index < lines.length; index += 46) pages.push(lines.slice(index, index + 46));
  const objects = [];
  const pageIds = [];
  pages.forEach((pageLines, pageIndex) => {
    const content = ['BT', '/F1 11 Tf', '14 TL', '48 780 Td'];
    pageLines.forEach((line, lineIndex) => {
      content.push(lineIndex === 0 ? `(${pdfEscape(line)}) Tj` : `T* (${pdfEscape(line)}) Tj`);
    });
    content.push('ET');
    const stream = content.join('\n');
    const contentId = 3 + pageIndex * 2;
    const pageId = contentId + 1;
    pageIds.push(pageId);
    objects.push(`${contentId} 0 obj<< /Length ${Buffer.byteLength(stream)} >>stream\n${stream}\nendstream\nendobj\n`);
    objects.push(`${pageId} 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources<< /Font<< /F1 1 0 R >> >> >>endobj\n`);
  });
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  const catalog = `2 0 obj<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>endobj\n`;
  const font = '1 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n';
  const root = `${3 + pages.length * 2} 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n`;
  const body = font + catalog + objects.join('') + root;
  const xref = ['0000000000 65535 f \n'];
  let offset = Buffer.byteLength('%PDF-1.4\n');
  const chunks = [font, catalog, ...objects, root];
  chunks.forEach((chunk) => {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    offset += Buffer.byteLength(chunk);
  });
  const start = offset;
  return Buffer.from(`%PDF-1.4\n${body}xref\n0 ${xref.length}\n${xref.join('')}trailer<< /Size ${xref.length} /Root ${3 + pages.length * 2} 0 R >>\nstartxref\n${start}\n%%EOF`);
}

module.exports = { excel, pdf };
