import { NextResponse } from 'next/server';
import { runPayloadSchema } from '../../../../lib/types/run-schema';
import { botRunner } from '../../../../lib/runner/process-runner';

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = runPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  if (payload.dryRun) {
    payload.altOps = {};
  }

  try {
    await botRunner.start(payload);
    return NextResponse.json({ status: botRunner.getStatus() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
