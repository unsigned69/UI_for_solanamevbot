import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import EventEmitter from 'events';
import { buildAltFlags, buildCommandPreview } from './cli-flags';
import { getBotCommand, getBotWorkdir, getConfigPath, getExtraFlagsDefault } from './env';
import type { BotStatus, BotState, RunPayload } from '../types/run';

export type RunnerEvent =
  | { type: 'state'; state: BotState; status: BotStatus }
  | { type: 'log'; stream: 'stdout' | 'stderr'; message: string };

class BotProcessRunner {
  private state: BotState = 'IDLE';
  private process: ChildProcessWithoutNullStreams | null = null;
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

    const baseCommand = getBotCommand();
    const args: string[] = [];
    const configPath = getConfigPath();
    const altFlags = buildAltFlags(payload.altOps);
    const defaultExtra = getExtraFlagsDefault();

    args.push('--config', configPath);
    if (payload.dryRun) {
      args.push('--dry-run');
    }
    args.push(...altFlags);
    if (payload.altAddress) {
      args.push('--alt-address', payload.altAddress);
    }
    if (payload.accountsSource === 'manual' && payload.accountsManual?.length) {
      args.push('--accounts', payload.accountsManual.join(','));
    }
    if (defaultExtra) {
      args.push(...defaultExtra.split(' ').filter(Boolean));
    }
    if (payload.extraFlags) {
      args.push(...payload.extraFlags.split(' ').filter(Boolean));
    }

    this.commandPreview = buildCommandPreview(payload, baseCommand);
    const finalCommand = [baseCommand, ...args].join(' ');

    const child = spawn(finalCommand, {
      cwd: getBotWorkdir(),
      shell: true,
      env: process.env,
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
  }

  async stop() {
    if (!this.process) {
      throw new Error('Бот не запущен');
    }
    this.process.kill('SIGTERM');
  }

  private transition(state: BotState) {
    this.state = state;
    const status = this.getStatus();
    this.emit({ type: 'state', state, status });
  }
}

export const botRunner = new BotProcessRunner();
