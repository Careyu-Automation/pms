const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const insights = require('../services/insights.service');

const overview = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Insights loaded.', data: await insights.overview(req.user, req.query || {}) });
});

const exportFile = asyncHandler(async (req, res) => {
  const file = await insights.exportFile(req.user, req.query || {});
  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.send(file.body);
});

module.exports = { overview, exportFile };
