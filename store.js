'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const file = (name) => path.join(config.dataDir, name);

function read(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}

function write(name, value) {
  fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const tmp = file(name) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file(name));
}

module.exports = { read, write };
