import { NextResponse } from 'next/server';
import { runPayloadSchema } from '../../../../lib/types/run-schema';
import { botRunner, PrelaunchCheckError } from '../../../../lib/runner/process-runner';
import { prepareRunPayload } from '../../../../lib/runner/payload';
import { uiLogger } from '../../../../lib/log/logger';

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = runPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  let sanitized: ReturnType<typeof prepareRunPayload> | null = null;
  try {
    sanitized = prepareRunPayload(parsed.data);
    await botRunner.start(sanitized);
    const status = botRunner.getStatus();
    uiLogger.info('runner_preflight', { ok: true, dryRun: sanitized.dryRun, state: status.state });
    uiLogger.info('runner_starting', { status, dryRun: sanitized.dryRun });
    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof PrelaunchCheckError) {
      uiLogger.warn('runner_preflight', error.message, {
        ok: false,
        dryRun: sanitized?.dryRun,
      });
      return NextResponse.json(
        {
          ok: false,
          code: 'PRELAUNCH_CHECK_FAILED',
          message: error.message,
          details: { status: botRunner.getStatus() },
        },
        { status: 400 },
      );
    }
    const message = (error as Error).message;
    uiLogger.error('runner_start_failed', message, sanitized ? { dryRun: sanitized.dryRun } : undefined);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
