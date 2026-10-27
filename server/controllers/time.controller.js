const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const time = require('../services/time.service');
const { timesheetExcel, reportExcel, pdf } = require('../services/timeExport');

const attendance = asyncHandler(async (req, res) => {
  const data = await time.day(req.user, req.params.date, req.query || {});
  sendSuccess(res, { message: 'Timesheet loaded.', data });
});

const checkIn = asyncHandler(async (req, res) => {
  const data = await time.checkIn(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Checked in.', data });
});

const checkOut = asyncHandler(async (req, res) => {
  const data = await time.checkOut(req.user, req.body || {});
  sendSuccess(res, { message: 'Checked out.', data });
});

const breaks = asyncHandler(async (req, res) => {
  const data = await time.breaksFor(req.user, req.params.date, req.query || {});
  sendSuccess(res, { message: 'Breaks loaded.', data: { breaks: data } });
});

const startBreak = asyncHandler(async (req, res) => {
  const data = await time.startBreak(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Break started.', data });
});

const endBreak = asyncHandler(async (req, res) => {
  const data = await time.endBreak(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'Break ended.', data });
});

const entries = asyncHandler(async (req, res) => {
  const rows = await time.listEntries(req.user, req.query || {});
  sendSuccess(res, { message: 'Time entries loaded.', data: { entries: rows } });
});

const createEntry = asyncHandler(async (req, res) => {
  const entry = await time.createEntry(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Time entry saved.', data: { entry } });
});

const updateEntry = asyncHandler(async (req, res) => {
  const entry = await time.updateEntry(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'Time entry saved.', data: { entry } });
});

const removeEntry = asyncHandler(async (req, res) => {
  await time.removeEntry(req.user, req.params.id);
  sendSuccess(res, { message: 'Time entry deleted.' });
});

const report = asyncHandler(async (req, res) => {
  const data = await time.reportFor(req.user, req.params.date, req.query || {});
  sendSuccess(res, { message: 'Daily report loaded.', data });
});

const saveReport = asyncHandler(async (req, res) => {
  const data = await time.saveReport(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Daily report saved.', data });
});

const updateReport = asyncHandler(async (req, res) => {
  const data = await time.updateReport(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'Daily report saved.', data });
});

const submitReport = asyncHandler(async (req, res) => {
  const data = await time.submitReport(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'Daily report submitted.', data });
});

const reopenReport = asyncHandler(async (req, res) => {
  const data = await time.reopenReport(req.user, req.params.id);
  sendSuccess(res, { message: 'Daily report reopened.', data });
});

const reports = asyncHandler(async (req, res) => {
  const data = await time.reports(req.user, req.query || {});
  sendSuccess(res, { message: 'Reports loaded.', data });
});

const teamReports = asyncHandler(async (req, res) => {
  const data = await time.teamReports(req.user, req.query || {});
  sendSuccess(res, { message: 'Team reports loaded.', data });
});

const catalog = asyncHandler(async (req, res) => {
  const data = await time.catalog(req.user);
  sendSuccess(res, { message: 'Time lookups loaded.', data });
});

function sendFile(res, body, type, filename) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

const exportTimesheet = asyncHandler(async (req, res) => {
  const data = await time.exportRows(req.user, req.query || {}, 'timesheet');
  if (req.query.format === 'pdf') {
    const lines = ['CareYu Automation', 'Timesheet', `${data.from} to ${data.to}`, ''];
    data.rows.forEach((row) => {
      lines.push(`${row.employeeName}  ${row.date}  ${row.projectName || 'General'}  ${row.taskTitle || ''}`);
      lines.push(row.description || '');
    });
    if (!data.rows.length) lines.push('No time entries for this range.');
    return sendFile(res, pdf('Timesheet', lines), 'application/pdf', 'timesheet.pdf');
  }
  return sendFile(res, timesheetExcel(data), 'application/vnd.ms-excel', 'timesheet.xls');
});

const exportReports = asyncHandler(async (req, res) => {
  const data = await time.exportRows(req.user, req.query || {}, 'report');
  if (req.query.format === 'pdf') {
    const lines = ['CareYu Automation', 'Daily Reports', `${data.from} to ${data.to}`, ''];
    data.reports.forEach((row) => {
      lines.push(`${row.employeeName}  ${row.date}  ${row.status}`);
      lines.push(row.whatIDid || '');
      if (row.notes) lines.push(row.notes);
      lines.push('');
    });
    if (!data.reports.length) lines.push('No submitted reports for this range.');
    return sendFile(res, pdf('Daily Reports', lines), 'application/pdf', 'daily-reports.pdf');
  }
  return sendFile(res, reportExcel(data), 'application/vnd.ms-excel', 'daily-reports.xls');
});

module.exports = {
  attendance,
  checkIn,
  checkOut,
  breaks,
  startBreak,
  endBreak,
  entries,
  createEntry,
  updateEntry,
  removeEntry,
  report,
  saveReport,
  updateReport,
  submitReport,
  reopenReport,
  reports,
  teamReports,
  catalog,
  exportTimesheet,
  exportReports,
};
