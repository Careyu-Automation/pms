const fs = require('fs');
const os = require('os');
const path = require('path');

function uploadsRoot() {
  if (process.env.UPLOAD_ROOT) return process.env.UPLOAD_ROOT;
  // Cloud Run ephemeral disk is reliable under /tmp; local/dev keeps project uploads/.
  if (process.env.K_SERVICE || process.env.NODE_ENV === 'production') {
    return path.join(os.tmpdir(), 'careyupms-uploads');
  }
  return path.join(__dirname, '..', 'uploads');
}

function ensureDir(...parts) {
  const dir = path.join(uploadsRoot(), ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function feasibilityDir(studyId) {
  return ensureDir('feasibility', String(studyId));
}

function leadsDir(leadId) {
  return ensureDir('leads', String(leadId));
}

module.exports = {
  uploadsRoot,
  ensureDir,
  feasibilityDir,
  leadsDir,
};
