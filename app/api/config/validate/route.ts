import { NextResponse } from 'next/server';
import { managedConfigSchema } from '../../../../lib/config/schema';
import { validateManagedConfig } from '../../../../lib/config/validate';

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = managedConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const report = validateManagedConfig(parsed.data);
  return NextResponse.json(report);
}
