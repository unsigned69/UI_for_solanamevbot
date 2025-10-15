import { NextResponse } from 'next/server';
import { botRunner } from '../../../../lib/runner/process-runner';

export async function GET() {
  return NextResponse.json({ status: botRunner.getStatus() });
}
