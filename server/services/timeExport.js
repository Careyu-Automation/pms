function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sheet(name, columns, rows) {
  const body = [columns, ...rows].map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${escapeXml(name)}"><Table>${body}</Table></Worksheet>
</Workbook>`;
}

function pdfEscape(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdf(title, lines) {
  const pages = [];
  const contentLines = [title, ...lines];
  for (let index = 0; index < contentLines.length; index += 46) pages.push(contentLines.slice(index, index + 46));
  if (!pages.length) pages.push(['No records.']);
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
  const font = '1 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n';
  const catalog = `2 0 obj<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>endobj\n`;
  const root = `${3 + pages.length * 2} 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n`;
  const body = font + catalog + objects.join('') + root;
  const xref = ['0000000000 65535 f \n'];
  let offset = Buffer.byteLength('%PDF-1.4\n');
  [font, catalog, ...objects, root].forEach((chunk) => {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    offset += Buffer.byteLength(chunk);
  });
  return Buffer.from(`%PDF-1.4\n${body}xref\n0 ${xref.length}\n${xref.join('')}trailer<< /Size ${xref.length} /Root ${3 + pages.length * 2} 0 R >>\nstartxref\n${offset}\n%%EOF`);
}

function clock(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function timesheetExcel(data) {
  const columns = ['Employee', 'Date', 'Check-in', 'Check-out', 'Break', 'Worked Hours', 'Project', 'Task', 'Description'];
  const rows = (data.rows || []).map((entry) => [
    entry.employeeName,
    entry.date,
    clock(entry.checkIn),
    clock(entry.checkOut),
    entry.breakMinutes ? `${entry.breakMinutes}m` : '',
    entry.durationMinutes ? (entry.durationMinutes / 60).toFixed(2) : entry.hours,
    entry.projectName,
    entry.taskTitle,
    entry.description,
  ]);
  return sheet('Timesheet', columns, rows);
}

function reportExcel(data) {
  const columns = ['Employee', 'Team', 'Date', 'Hours', 'What I Did', 'What to Improve', 'Notes', 'Submission Status', 'Submitted At'];
  const rows = (data.reports || []).map((report) => [
    report.employeeName,
    report.teamName || '',
    report.date,
    ((report.loggedMinutes || 0) / 60).toFixed(2),
    report.whatIDid,
    report.whatToImprove,
    report.notes,
    report.status,
    clock(report.submittedAt),
  ]);
  return sheet('Daily Reports', columns, rows);
}

module.exports = { timesheetExcel, reportExcel, pdf, clock };
