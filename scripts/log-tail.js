#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_LIMIT = 200;
const rawLimit = Number(process.argv[2]);
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : DEFAULT_LIMIT;

const logDir = path.resolve(
  process.cwd(),
  process.env.SMB_UI_LOG_DIR && process.env.SMB_UI_LOG_DIR.trim().length > 0
    ? process.env.SMB_UI_LOG_DIR
    : './logs',
);

function formatLogFiles(names) {
  return names
    .map((name) => {
      const match = name.match(/^(\d{3})-(\d{8})\.log$/);
      if (!match) {
        return null;
      }
      const seq = Number(match[1]);
      const date = match[2];
      return {
        name,
        seq,
        date,
        path: path.join(logDir, name),
      };
    })
    .filter(Boolean);
}

async function readLatestLogFile() {
  const entries = await fs.promises.readdir(logDir).catch(() => []);
  const files = formatLogFiles(entries);
  if (!files.length) {
    return null;
  }
  files.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.seq - b.seq;
  });
  return files[files.length - 1];
}

async function tailLogFile(filePath) {
  const content = await fs.promises.readFile(filePath, 'utf8').catch(() => '');
  if (!content) {
    return '';
  }
  const lines = content.split(/\r?\n/);
  const filtered = lines.filter((line, index) => !(index === lines.length - 1 && line === ''));
  const sliceStart = filtered.length > limit ? filtered.length - limit : 0;
  return filtered.slice(sliceStart).join('\n');
}

(async () => {
  try {
    const latest = await readLatestLogFile();
    if (!latest) {
      console.error(`[log-tail] No log files found in ${logDir}`);
      process.exit(0);
      return;
    }
    const tail = await tailLogFile(latest.path);
    if (tail) {
      process.stdout.write(tail);
      if (!tail.endsWith('\n')) {
        process.stdout.write('\n');
      }
    }
  } catch (error) {
    console.error(`[log-tail] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
})();
