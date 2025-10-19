import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import EventEmitter from 'events';
import { getBotCommand, getBotWorkdir, getConfigPath, getExtraFlagsDefault } from './env';
import { ensureConfigLockNotPresent } from './payload';
import { buildRunCommand } from './command-builder';
import { getConfigLockPath } from '../config/toml-managed-block';
import type { BotStatus, BotState, RunPayload } from '../types/run';

export type RunnerEvent =
  | { type: 'state'; state: BotState; status: BotStatus }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string };

type SubscriberRecord = {
  listener: (event: RunnerEvent) => void;
  disposeOnStop?: () => void;
};

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
    this.transition('STARTING');

    try {
      const baseCommand = getBotCommand();
      const configPath = getConfigPath();
      const lockPath = getConfigLockPath();
      ensureConfigLockNotPresent(lockPath);

      const commandBuild = buildRunCommand(payload, {
        configPath,
        defaultExtraFlags: getExtraFlagsDefault(),
        baseCommand,
      });
      this.commandPreview = commandBuild.commandPreview;

      const child = spawn(commandBuild.command, commandBuild.args, {
        cwd: getBotWorkdir(),
        shell: false,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.process = child;
      this.startedAt = Date.now();
      this.transition('RUNNING');

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

      let handleClose: (code: number | null) => void;
      let handleError: (error: Error) => void;

      const finalize = (state: BotState) => {
        if (this.process !== child) {
          return;
        }
        child.stdout?.off('data', handleStdout);
        child.stderr?.off('data', handleStderr);
        child.removeListener('close', handleClose);
        child.removeListener('error', handleError);
        this.process = null;
        this.startedAt = undefined;
        this.commandPreview = '';
        this.transition(state);
        this.disposeSubscribers();
      };

      handleClose = (code: number | null) => {
        finalize(code === 0 ? 'STOPPED' : 'ERROR');
      };

      handleError = (error: Error) => {
        this.emit({ type: 'log', stream: 'stderr', message: error.message });
        finalize('ERROR');
      };

      child.once('close', handleClose);
      child.once('error', handleError);
    } catch (error) {
      this.process = null;
      this.startedAt = undefined;
      this.commandPreview = '';
      this.transition('ERROR');
      this.disposeSubscribers();
      throw error;
    }
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

  private transition(state: BotState) {
    this.state = state;
    const status = this.getStatus();
    this.emit({ type: 'state', state, status });
  }
}

export const botRunner = new BotProcessRunner();
