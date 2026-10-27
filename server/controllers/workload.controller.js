const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const workload = require('../services/workload.service');
const { excel, pdfReport } = require('../services/workloadExport');

const board = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Workload loaded.', data: await workload.board(req.user, req.query || {}) });
});

const employee = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Employee workload loaded.', data: await workload.employee(req.user, req.params.id, req.query || {}) });
});

const insights = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Employee insights loaded.', data: await workload.insights(req.user, req.params.id, req.query || {}) });
});

const tasks = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Employee tasks loaded.', data: await workload.tasks(req.user, req.params.id, req.query || {}) });
});

const hours = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Timesheet loaded.', data: await workload.hours(req.user, req.params.id, req.query || {}) });
});

const attendance = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Attendance loaded.', data: await workload.attendance(req.user, req.params.id, req.query || {}) });
});

const rebalanceOptions = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Rebalance options loaded.', data: await workload.rebalanceOptions(req.user, req.params.id, req.query || {}) });
});

const rebalance = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Work reassigned.', data: await workload.rebalance(req.user, req.body || {}) });
});

function sendFile(res, body, type, filename) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(body);
}

const exportExcel = asyncHandler(async (req, res) => {
  const data = await workload.exportRows(req.user, req.query || {});
  sendFile(res, excel(data), 'application/vnd.ms-excel', 'workload.xls');
});

const exportPdf = asyncHandler(async (req, res) => {
  const data = await workload.exportRows(req.user, req.query || {});
  sendFile(res, pdfReport(data), 'application/pdf', 'workload.pdf');
});

module.exports = {
  board,
  employee,
  insights,
  tasks,
  hours,
  attendance,
  rebalanceOptions,
  rebalance,
  exportExcel,
  exportPdf,
};
