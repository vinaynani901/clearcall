// Tiny helper for the admin AI Configuration provider switcher (Part 10) to
// persist a changed value into the real .env file, not just process.env —
// so the choice survives a server restart too. Writing process.env directly
// takes effect immediately for every subsequent aiTailor.js call (that's
// the whole "restarts the tailoring service automatically" requirement:
// there's no cached client to actually restart, every call already reads
// process.env fresh).
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '..', '.env');

function setEnvVar(key, value) {
  process.env[key] = value;

  let contents = '';
  try {
    contents = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    contents = '';
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.replace(/\n?$/, '\n')}${line}\n`;

  fs.writeFileSync(ENV_PATH, contents, 'utf8');
}

module.exports = { setEnvVar, ENV_PATH };
