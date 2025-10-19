import { NextResponse } from 'next/server';
import { managedConfigSchema } from '../../../../lib/config/schema';
import { writeManagedConfig, readManagedConfig } from '../../../../lib/config/toml-managed-block';
import { validateManagedConfig } from '../../../../lib/config/validate';
import { diffManagedConfigs } from '../../../../lib/config/diff';
import { botRunner } from '../../../../lib/runner/process-runner';

export async function POST(request: Request) {
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
      return NextResponse.json({ error: validation.errors, validation }, { status: 400 });
    }

    const prev = await readManagedConfig();
    const diff = diffManagedConfigs(prev.managed, parsed.data);
    if (diff === 'No changes') {
      return NextResponse.json({ ok: true, diff, validation, skipped: true });
    }

    const writeResult = await writeManagedConfig(parsed.data);
    return NextResponse.json({ ok: true, diff, validation, backupPath: writeResult.backupPath });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
