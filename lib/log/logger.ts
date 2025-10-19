import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { redactMeta } from './redact';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  ts: string;
  lvl: LogLevel;
  evt: string;
  msg?: string;
  meta: Record<string, unknown>;
}

interface LogFileEntry {
  name: string;
  path: string;
  seq: number;
  date: string;
  size: number;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveEnabled(): boolean {
  const explicit = process.env.SMB_UI_LOG_ENABLE;
  if (explicit !== undefined) {
    return explicit !== '0' && explicit.toLowerCase() !== 'false';
  }
  return process.env.NODE_ENV !== 'production';
}

function resolveLogDir(): string {
  const configured = process.env.SMB_UI_LOG_DIR;
  const target = configured && configured.trim().length > 0 ? configured : './logs';
  return path.resolve(process.cwd(), target);
}

function resolveLogLevel(): LogLevel {
  const raw = process.env.SMB_UI_LOG_LEVEL;
  if (!raw) {
    return 'info';
  }
  const candidate = raw.trim().toLowerCase();
  if (candidate === 'debug' || candidate === 'info' || candidate === 'warn' || candidate === 'error') {
    return candidate;
  }
  return 'info';
}

function resolveMaxBytes(): number {
  const raw = process.env.SMB_UI_LOG_FILE_MAX_BYTES;
  const fallback = 5_242_880; // 5 MiB
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveMaxFiles(): number {
  const raw = process.env.SMB_UI_LOG_MAX_FILES;
  const fallback = 60;
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function resolveMaxTotalBytes(): number {
  const raw = process.env.SMB_UI_LOG_MAX_TOTAL_BYTES;
  const fallback = 200_000_000; // ~200 MB
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}${month}${day}`;
}

function padSequence(seq: number): string {
  return `${seq}`.padStart(3, '0');
}

async function safeStat(filePath: string): Promise<fs.Stats | null> {
  try {
    const stats = await fsPromises.stat(filePath);
    return stats.isFile() ? stats : null;
  } catch (error) {
    return null;
  }
}

async function listLogFiles(dir: string): Promise<LogFileEntry[]> {
  try {
    const entries = await fsPromises.readdir(dir);
    const result: LogFileEntry[] = [];
    await Promise.all(
      entries.map(async (name) => {
        const match = name.match(/^(\d{3})-(\d{8})\.log$/);
        if (!match) {
          return;
        }
        const seq = Number(match[1]);
        const date = match[2];
        const filePath = path.join(dir, name);
        const stats = await safeStat(filePath);
        if (!stats) {
          return;
        }
        result.push({ name, path: filePath, seq, date, size: stats.size });
      }),
    );
    return result;
  } catch (error) {
    return [];
  }
}

function sortEntriesAsc(entries: LogFileEntry[]): LogFileEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.seq - b.seq;
  });
}

class RotatingFileLogger {
  private readonly enabled: boolean;

  private readonly dir: string;

  private readonly levelThreshold: number;

  private readonly maxFileBytes: number;

  private readonly maxFiles: number;

  private readonly maxTotalBytes: number;

  private initPromise: Promise<void>;

  private initError: Error | null = null;

  private queue: string[] = [];

  private writing = false;

  private currentPath: string | null = null;

  private currentSeq = 0;

  private currentDate: string | null = null;

  private currentSize = 0;

  constructor() {
    this.enabled = resolveEnabled();
    this.dir = resolveLogDir();
    this.levelThreshold = LEVEL_PRIORITY[resolveLogLevel()];
    this.maxFileBytes = resolveMaxBytes();
    this.maxFiles = resolveMaxFiles();
    this.maxTotalBytes = resolveMaxTotalBytes();
    this.initPromise = this.enabled ? this.initialize() : Promise.resolve();
    this.initPromise.catch((error) => {
      this.initError = error instanceof Error ? error : new Error(String(error));
      console.error('[ui-logger] initialization failed:', this.initError.message);
    });
  }

  public log(level: LogLevel, evt: string, message?: string, meta?: Record<string, unknown>): void {
    if (!this.enabled) {
      return;
    }
    if (LEVEL_PRIORITY[level] < this.levelThreshold) {
      return;
    }
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      lvl: level,
      evt,
      meta: redactMeta(meta),
    };
    if (message) {
      entry.msg = message;
    }
    const payload = `${JSON.stringify(entry)}\n`;
    this.queue.push(payload);
    void this.processQueue();
  }

  private async processQueue() {
    if (this.writing) {
      return;
    }
    this.writing = true;
    try {
      await this.initPromise;
      if (this.initError) {
        this.queue = [];
        return;
      }
      while (this.queue.length > 0) {
        const chunk = this.queue.shift();
        if (!chunk) {
          continue;
        }
        try {
          await this.writeChunk(chunk);
        } catch (error) {
          console.error('[ui-logger] write failed:', error);
        }
      }
    } finally {
      this.writing = false;
    }
  }

  private async initialize() {
    await fsPromises.mkdir(this.dir, { recursive: true });
    const entries = await listLogFiles(this.dir);
    const today = formatDateUTC(new Date());
    const todays = entries.filter((entry) => entry.date === today);
    if (todays.length === 0) {
      await this.rotate(today, 1);
      return;
    }
    const sorted = sortEntriesAsc(todays);
    const latest = sorted[sorted.length - 1];
    this.currentPath = latest.path;
    this.currentSeq = latest.seq;
    this.currentDate = latest.date;
    this.currentSize = latest.size;
    if (this.currentSize >= this.maxFileBytes) {
      await this.rotate(today, latest.seq + 1);
    } else {
      await this.applyRetention(entries);
    }
  }

  private async writeChunk(chunk: string): Promise<void> {
    const bytes = Buffer.byteLength(chunk);
    await this.ensureFile(bytes);
    if (!this.currentPath) {
      return;
    }
    await fsPromises.appendFile(this.currentPath, chunk, 'utf8');
    this.currentSize += bytes;
  }

  private async ensureFile(additionalBytes: number) {
    const today = formatDateUTC(new Date());
    if (!this.currentPath || this.currentDate !== today) {
      await this.rotate(today, 1);
      return;
    }
    if (this.currentSize + additionalBytes > this.maxFileBytes) {
      await this.rotate(today, this.currentSeq + 1);
    }
  }

  private async rotate(targetDate: string, seq: number) {
    await fsPromises.mkdir(this.dir, { recursive: true });
    const fileName = `${padSequence(seq)}-${targetDate}.log`;
    const filePath = path.join(this.dir, fileName);
    await fsPromises.writeFile(filePath, '', { flag: 'a' });
    const stats = await safeStat(filePath);
    this.currentPath = filePath;
    this.currentSeq = seq;
    this.currentDate = targetDate;
    this.currentSize = stats?.size ?? 0;
    const entries = await listLogFiles(this.dir);
    await this.applyRetention(entries);
  }

  private async applyRetention(entries: LogFileEntry[]) {
    if (!this.maxFiles && !this.maxTotalBytes) {
      return;
    }
    const sorted = sortEntriesAsc(entries);
    let totalBytes = sorted.reduce((sum, entry) => sum + entry.size, 0);
    while (sorted.length > 0) {
      const exceedsFiles = this.maxFiles > 0 && sorted.length > this.maxFiles;
      const exceedsBytes = this.maxTotalBytes > 0 && totalBytes > this.maxTotalBytes;
      if (!exceedsFiles && !exceedsBytes) {
        break;
      }
      const entry = sorted.shift();
      if (!entry) {
        break;
      }
      if (this.currentPath && path.resolve(entry.path) === path.resolve(this.currentPath)) {
        continue;
      }
      try {
        await fsPromises.unlink(entry.path);
        totalBytes -= entry.size;
      } catch (error) {
        console.error('[ui-logger] failed to prune log file', entry.path, error);
      }
    }
  }
}

class UiLogger {
  private readonly writer = new RotatingFileLogger();

  debug(evt: string, meta?: Record<string, unknown>): void {
    this.writer.log('debug', evt, undefined, meta);
  }

  info(evt: string, meta?: Record<string, unknown>): void {
    this.writer.log('info', evt, undefined, meta);
  }

  warn(evt: string, message: string, meta?: Record<string, unknown>): void {
    this.writer.log('warn', evt, message, meta);
  }

  error(evt: string, message: string, meta?: Record<string, unknown>): void {
    this.writer.log('error', evt, message, meta);
  }
}

export const uiLogger = new UiLogger();

