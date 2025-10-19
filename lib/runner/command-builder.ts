import type { RunPayload } from '../types/run';
import { buildAltFlags, buildCommandPreview } from './cli-flags';
import { describeCommandArgsForPreview, sanitizeDefaultExtraFlags } from './payload';

interface CommandBuildOptions {
  configPath: string;
  defaultExtraFlags: string;
  baseCommand: string;
}

interface CommandBuildResult {
  command: string;
  args: string[];
  previewArgs: string[];
  commandPreview: string;
}

export function buildRunCommand(payload: RunPayload, options: CommandBuildOptions): CommandBuildResult {
  const args: string[] = ['--config', options.configPath];
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

  const defaultExtraFlags = sanitizeDefaultExtraFlags(options.defaultExtraFlags);
  args.push(...defaultExtraFlags);

  if (payload.extraFlags?.length) {
    args.push(...payload.extraFlags);
  }

  const previewArgs = describeCommandArgsForPreview(args, options.configPath);
  const commandPreview = buildCommandPreview(options.baseCommand, previewArgs);

  return {
    command: options.baseCommand,
    args,
    previewArgs,
    commandPreview,
  };
}
