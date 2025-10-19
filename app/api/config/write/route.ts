import { NextResponse } from 'next/server';
import { managedConfigSchema } from '../../../../lib/config/schema';
import {
  writeManagedConfig,
  readManagedConfig,
  ConfigLockActiveError,
} from '../../../../lib/config/toml-managed-block';
import { validateManagedConfig } from '../../../../lib/config/validate';
import { diffManagedConfigs } from '../../../../lib/config/diff';
import { botRunner } from '../../../../lib/runner/process-runner';
import { uiLogger } from '../../../../lib/log/logger';
import { withApiLogging } from '../../../../lib/log/with-api-logging';

export const runtime = 'nodejs';

async function postHandler(request: Request) {
  const json = await request.json();
  const parsed = managedConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const status = botRunner.getStatus();
    if (status.state === 'RUNNING' || status.state === 'STARTING') {
      return NextResponse.json({ error: 'Нельзя обновлять конфиг во время запуска или работы бота.' }, { status: 409 });
    }

    const validation = validateManagedConfig(parsed.data);
    if (!validation.ok) {
      uiLogger.info('config_write_attempt', {
        diff_empty: null,
        diff_length: 0,
        lock: 'skipped',
        reason: 'validation_failed',
      });
      uiLogger.warn('config_write_result', 'validation_failed', { status: 'validation_failed' });
      return NextResponse.json({ error: validation.errors, validation }, { status: 400 });
    }

    const prev = await readManagedConfig();
    const diff = diffManagedConfigs(prev.managed, parsed.data);
    if (diff === 'No changes') {
      uiLogger.info('config_write_attempt', {
        diff_empty: true,
        diff_length: 0,
        lock: 'skipped',
      });
      uiLogger.info('config_write_result', { status: 'skipped', lock: 'skipped' });
      return NextResponse.json({ ok: true, diff, validation, skipped: true });
    }

    try {
      const writeResult = await writeManagedConfig(parsed.data);
      uiLogger.info('config_write_attempt', {
        diff_empty: false,
        diff_length: diff.length,
        lock: writeResult.lockStatus,
      });
      uiLogger.info('config_write_result', {
        status: 'ok',
        backupPath: writeResult.backupPath,
        lock: writeResult.lockStatus,
      });
      return NextResponse.json({ ok: true, diff, validation, backupPath: writeResult.backupPath });
    } catch (error) {
      if (error instanceof ConfigLockActiveError) {
        uiLogger.info('config_write_attempt', {
          diff_empty: false,
          diff_length: diff.length,
          lock: 'active',
        });
        uiLogger.warn('config_write_result', error.message, { status: 'locked', lock: 'active' });
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  } catch (error) {
    const message = (error as Error).message;
    uiLogger.info('config_write_attempt', {
      diff_empty: null,
      diff_length: 0,
      lock: 'unknown',
      reason: 'exception',
    });
    uiLogger.error('config_write_result', message, { status: 'error', lock: 'unknown' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApiLogging(postHandler, { routeId: '/api/config/write' });
