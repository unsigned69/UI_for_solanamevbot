import { NextResponse } from 'next/server';
import { botRunner } from '../../../../lib/runner/process-runner';

export async function POST() {
  try {
    await botRunner.stop();
    return NextResponse.json({ status: botRunner.getStatus() });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
