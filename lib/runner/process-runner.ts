import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import EventEmitter from 'events';
import { getBotCommand, getBotWorkdir, getConfigPath, getExtraFlagsDefault } from './env';
import { ensureConfigLockNotPresent } from './payload';
import { buildRunCommand } from './command-builder';
import { getConfigLockPath } from '../config/toml-managed-block';
import type { BotStatus, BotState, RunPayload } from '../types/run';
import { uiLogger } from '../log/logger';

export class PrelaunchCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrelaunchCheckError';
  }
}

export type RunnerEvent =
  | { type: 'state'; state: BotState; status: BotStatus }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string }
  | { type: 'lifecycle'; event: 'STARTED' | 'ERROR'; status: BotStatus; message?: string };

type SubscriberRecord = {
  listener: (event: RunnerEvent) => void;
  disposeOnStop?: () => void;
};

function parseCommandParts(raw: string): { executable: string; args: string[] } {
  const tokens = raw.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const cleaned = tokens.map((token) => token.replace(/^['"]|['"]$/g, ''));
  const [executable = '', ...args] = cleaned;
  return { executable, args };
}

function ensureWorkdirExists(workdirRaw: string | undefined): string {
  if (!workdirRaw) {
    throw new PrelaunchCheckError('Workdir not found');
  }
  const resolved = path.resolve(workdirRaw);
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isDirectory()) {
      throw new PrelaunchCheckError('Workdir not found');
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    return resolved;
  } catch (error) {
    if (error instanceof PrelaunchCheckError) {
      throw error;
    }
    throw new PrelaunchCheckError('Workdir not found');
  }
}

function ensureConfigExists(configPath: string): string {
  const resolved = path.resolve(configPath);
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isFile()) {
      throw new PrelaunchCheckError('Config not found');
    }
    fs.accessSync(resolved, fs.constants.R_OK);
    return resolved;
  } catch (error) {
    if (error instanceof PrelaunchCheckError) {
      throw error;
    }
    throw new PrelaunchCheckError('Config not found');
  }
}

function shouldVerifyPath(command: string): boolean {
  return /[\\/]/.test(command) || command.startsWith('.');
}

function ensureExecutableExists(executable: string, workdir: string) {
  if (!executable) {
    throw new PrelaunchCheckError('Executable not found');
  }
  if (!shouldVerifyPath(executable)) {
    return;
  }
  const resolved = path.isAbsolute(executable) ? executable : path.resolve(workdir, executable);
  try {
    const stats = fs.statSync(resolved);
    if (!stats.isFile() && !stats.isFIFO()) {
      throw new PrelaunchCheckError('Executable not found');
    }
    fs.accessSync(resolved, fs.constants.X_OK);
  } catch (error) {
    if (error instanceof PrelaunchCheckError) {
      throw error;
    }
    throw new PrelaunchCheckError('Executable not found');
  }
}

function resolveNodeScriptPath(commandParts: { executable: string; args: string[] }, workdir: string): string | null {
  if (!commandParts.executable) {
    return null;
  }
  const baseName = path.basename(commandParts.executable).toLowerCase();
  if (baseName !== 'node' && baseName !== 'node.exe') {
    return null;
  }
  const [firstArg] = commandParts.args;
  if (!firstArg || firstArg.startsWith('-')) {
    return null;
  }
  return path.isAbsolute(firstArg) ? firstArg : path.resolve(workdir, firstArg);
}

function ensureNodeScriptExists(commandParts: { executable: string; args: string[] }, workdir: string) {
  const scriptPath = resolveNodeScriptPath(commandParts, workdir);
  if (!scriptPath) {
    return;
  }
  try {
    const stats = fs.statSync(scriptPath);
    if (!stats.isFile()) {
      throw new PrelaunchCheckError('Executable not found');
    }
    fs.accessSync(scriptPath, fs.constants.R_OK);
  } catch (error) {
    if (error instanceof PrelaunchCheckError) {
      throw error;
    }
    throw new PrelaunchCheckError('Executable not found');
  }
}

function isProcessAlive(child: ChildProcess): boolean {
  if (typeof child.pid !== 'number' || child.pid <= 0) {
    return false;
  }
  if (child.exitCode !== null) {
    return false;
  }
  try {
    process.kill(child.pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

class BotProcessRunner {
  private state: BotState = 'IDLE';

  private process: ChildProcess | null = null;

  private emitter = new EventEmitter();

  private subscribers = new Map<(event: RunnerEvent) => void, SubscriberRecord>();

  private startedAt?: number;

  private commandPreview = '';

  private logBuffer: RunnerEvent[] = [];

  private static readonly LOG_BUFFER_LIMIT = 2_000;

  private static readonly LOG_CHUNK_LIMIT = 8_192;

  subscribe(listener: (event: RunnerEvent) => void, options: { onStop?: () => void } = {}) {
    const record: SubscriberRecord = { listener, disposeOnStop: options.onStop };
    this.subscribers.set(listener, record);
    this.emitter.on('event', listener);
    this.logBuffer.forEach((event) => {
      if (event.type === 'log') {
        listener(event);
      }
    });
    uiLogger.info('runner_ws_subscribers', {
      action: 'attach',
      count: this.subscribers.size,
    });
    return () => {
      this.removeSubscriber(listener, 'manual');
    };
  }

  private removeSubscriber(listener: (event: RunnerEvent) => void, reason: 'manual' | 'stop') {
    const record = this.subscribers.get(listener);
    if (!record) {
      return;
    }
    this.emitter.removeListener('event', listener);
    this.subscribers.delete(listener);
    uiLogger.info('runner_ws_subscribers', {
      action: 'detach',
      reason,
      count: this.subscribers.size,
    });
    if (reason === 'stop') {
      try {
        record.disposeOnStop?.();
      } catch (error) {
        // no-op: best effort cleanup
      }
    }
  }

  private disposeSubscribers() {
    Array.from(this.subscribers.keys()).forEach((listener) => {
      this.removeSubscriber(listener, 'stop');
    });
  }

  private emit(event: RunnerEvent) {
    const payload: RunnerEvent =
      event.type === 'log'
        ? { ...event, message: this.sanitizeLogMessage(event.message) }
        : event;
    if (payload.type === 'log') {
      this.logBuffer.push(payload);
      if (this.logBuffer.length > BotProcessRunner.LOG_BUFFER_LIMIT) {
        this.logBuffer.splice(0, this.logBuffer.length - BotProcessRunner.LOG_BUFFER_LIMIT);
      }
    }
    this.emitter.emit('event', payload);
  }

  private emitLifecycle(event: 'STARTED' | 'ERROR', message?: string) {
    const payload: RunnerEvent = {
      type: 'lifecycle',
      event,
      status: this.getStatus(),
    };
    if (message) {
      payload.message = message;
    }
    this.emit(payload);
  }

  private sanitizeLogMessage(message: string): string {
    if (!message || message.length <= BotProcessRunner.LOG_CHUNK_LIMIT) {
      return message;
    }
    return `${message.slice(0, BotProcessRunner.LOG_CHUNK_LIMIT)}…`;
  }

  getStatus(): BotStatus {
    return {
      state: this.state,
      pid: this.process?.pid,
      startedAt: this.startedAt,
      commandPreview: this.commandPreview,
    };
  }

  async start(payload: RunPayload) {
    if (this.process) {
      throw new Error('Бот уже запущен');
    }
    const baseCommand = getBotCommand();
    const commandParts = parseCommandParts(baseCommand);
    const workdir = ensureWorkdirExists(getBotWorkdir());
    const configPathRaw = getConfigPath();
    const configPath = ensureConfigExists(configPathRaw);
    const lockPath = getConfigLockPath();
    ensureConfigLockNotPresent(lockPath);

    const commandBuild = buildRunCommand(payload, {
      configPath,
      defaultExtraFlags: getExtraFlagsDefault(),
      baseCommand,
    });
    this.commandPreview = commandBuild.commandPreview;

    try {
      ensureExecutableExists(commandParts.executable, workdir);
      ensureNodeScriptExists(commandParts, workdir);
    } catch (error) {
      this.commandPreview = '';
      throw error;
    }

    this.transition('STARTING', { command: commandParts.executable });

    const spawnArgs = [...commandParts.args, ...commandBuild.args];
    let child: ChildProcess;
    try {
      child = spawn(commandParts.executable, spawnArgs, {
        cwd: workdir,
        shell: false,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const message = (error as Error).message;
      uiLogger.error('runner_error', message, { phase: 'spawn', commandPreview: this.commandPreview });
      this.transition('ERROR', { phase: 'spawn' });
      this.emitLifecycle('ERROR', message);
      this.commandPreview = '';
      throw error;
    }

    this.process = child;

    const handleStdout = (chunk: Buffer) => {
      const message = chunk.toString();
      this.emit({ type: 'log', stream: 'stdout', message });
    };
    const handleStderr = (chunk: Buffer) => {
      const message = chunk.toString();
      this.emit({ type: 'log', stream: 'stderr', message });
    };

    child.stdout?.on('data', handleStdout);
    child.stderr?.on('data', handleStderr);

    let spawnConfirmed = false;
    let closed = false;

    const finalize = (state: BotState, message?: string, meta: Record<string, unknown> = {}) => {
      if (this.process !== child) {
        return;
      }
      closed = true;
      child.stdout?.off('data', handleStdout);
      child.stderr?.off('data', handleStderr);
      child.removeAllListeners('spawn');
      child.removeAllListeners('close');
      child.removeAllListeners('error');
      const previewBefore = this.commandPreview;
      this.process = null;
      this.startedAt = undefined;
      this.commandPreview = '';
      this.transition(state, meta);
      if (state === 'ERROR') {
        uiLogger.error('runner_error', message ?? 'Runner exited with error', {
          ...meta,
          commandPreview: previewBefore,
        });
        this.emitLifecycle('ERROR', message);
      }
      this.disposeSubscribers();
    };

    const handleSpawn = () => {
      if (this.process !== child || closed) {
        return;
      }
      if (!isProcessAlive(child)) {
        finalize('ERROR', 'Process exited before initialization', { phase: 'spawn_check' });
        return;
      }
      spawnConfirmed = true;
      this.startedAt = Date.now();
      this.transition('RUNNING', { pid: child.pid });
      uiLogger.info('runner_started', {
        pid: child.pid ?? null,
        commandPreview: this.commandPreview,
      });
      this.emitLifecycle('STARTED');
    };

    const handleClose = (code: number | null, signal: NodeJS.Signals | null) => {
      const gracefulSignals: ReadonlySet<NodeJS.Signals> = new Set(['SIGINT', 'SIGTERM']);
      const success =
        (signal !== null && gracefulSignals.has(signal)) || (signal === null && spawnConfirmed && code === 0);
      const message = success
        ? undefined
        : `Exit code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}`;
      const meta: Record<string, unknown> = { code, signal };
      finalize(success ? 'IDLE' : 'ERROR', message, meta);
    };

    const handleError = (error: Error) => {
      this.emit({ type: 'log', stream: 'stderr', message: error.message });
      finalize('ERROR', error.message, { phase: 'process_error' });
    };

    child.once('spawn', handleSpawn);
    child.once('close', handleClose);
    child.once('error', handleError);
  }

  async stop() {
    if (!this.process) {
      throw new Error('Бот не запущен');
    }
    const child = this.process;
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        child.removeListener('close', handleClose);
        child.removeListener('error', handleError);
        clearTimeout(termTimer);
        clearTimeout(killTimer);
      };
      const handleClose = () => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      };
      const handleError = (error: Error) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(error);
        }
      };

      const termTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGTERM');
        }
      }, 5_000);

      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 10_000);

      child.once('close', handleClose);
      child.once('error', handleError);

      const signalSent = child.kill('SIGINT');
      if (!signalSent) {
        if (child.exitCode !== null || child.signalCode !== null) {
          handleClose();
        } else {
          handleError(new Error('Не удалось отправить сигнал процессу'));
        }
      }
    });
  }

  private transition(state: BotState, meta: Record<string, unknown> = {}) {
    const previous = this.state;
    this.state = state;
    const status = this.getStatus();
    this.emit({ type: 'state', state, status });
    if (previous !== state) {
      uiLogger.info('runner_state_change', {
        from: previous,
        to: state,
        pid: status.pid ?? null,
        ...meta,
      });
    }
  }
}

export const botRunner = new BotProcessRunner();
