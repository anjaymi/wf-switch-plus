const path = require('path');
const os = require('os');

const ACCOUNT_MGR_DIR = path.join(os.homedir(), '.wf-account-mgr');

const SHARED_STATE_FILE = path.join(ACCOUNT_MGR_DIR, 'wf-shared-state.json');
const BRIDGE_REQUEST_FILE = path.join(ACCOUNT_MGR_DIR, 'wf-bridge-request.json');
const BRIDGE_REPLY_FILE = path.join(ACCOUNT_MGR_DIR, 'wf-bridge-reply.json');

module.exports = {
  ACCOUNT_MGR_DIR,
  SHARED_STATE_FILE,
  BRIDGE_REQUEST_FILE,
  BRIDGE_REPLY_FILE,
};
