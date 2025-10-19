import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import EventEmitter from 'events';
import { buildAltFlags, buildCommandPreview } from './cli-flags';
import { getBotCommand, getBotWorkdir, getConfigPath, getExtraFlagsDefault } from './env';
import { describeCommandArgsForPreview, ensureConfigLockNotPresent, sanitizeDefaultExtraFlags } from './payload';
import { getConfigLockPath } from '../config/toml-managed-block';
import type { BotStatus, BotState, RunPayload } from '../types/run';

export type RunnerEvent =
  | { type: 'state'; state: BotState; status: BotStatus }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string };

class BotProcessRunner {
  private state: BotState = 'IDLE';
  private process: ChildProcess | null = null;
  private emitter = new EventEmitter();
  private startedAt?: number;
  private commandPreview = '';

  subscribe(listener: (event: RunnerEvent) => void) {
    this.emitter.on('event', listener);
    return () => this.emitter.removeListener('event', listener);
  }

  private emit(event: RunnerEvent) {
    this.emitter.emit('event', event);
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

      const args: string[] = ['--config', configPath];
      if (payload.dryRun) {
        args.push('--dry-run');
      }
      args.push(...buildAltFlags(payload.altOps));
      if (payload.altAddress) {
        args.push('--alt-address', payload.altAddress);
      }
      if (payload.accountsSource === 'manual' && payload.accountsManual?.length) {
        args.push('--accounts', payload.accountsManual.join(','));
      }
      const defaultExtraFlags = sanitizeDefaultExtraFlags(getExtraFlagsDefault());
      args.push(...defaultExtraFlags);
      if (payload.extraFlags?.length) {
        args.push(...payload.extraFlags);
      }

      const previewArgs = describeCommandArgsForPreview(args, configPath);
      this.commandPreview = buildCommandPreview(baseCommand, previewArgs);

      const child = spawn(baseCommand, args, {
        cwd: getBotWorkdir(),
        shell: false,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.process = child;
      this.startedAt = Date.now();
      this.transition('RUNNING');

      child.stdout.on('data', (chunk: Buffer) => {
        const message = chunk.toString();
        this.emit({ type: 'log', stream: 'stdout', message });
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const message = chunk.toString();
        this.emit({ type: 'log', stream: 'stderr', message });
      });

      child.on('close', (code) => {
        this.process = null;
        this.transition(code === 0 ? 'STOPPED' : 'ERROR');
      });

      child.on('error', (error) => {
        this.emit({ type: 'log', stream: 'stderr', message: error.message });
        this.process = null;
        this.transition('ERROR');
      });
    } catch (error) {
      this.process = null;
      this.startedAt = undefined;
      this.commandPreview = '';
      this.transition('ERROR');
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
