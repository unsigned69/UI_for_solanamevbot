import { NextResponse } from 'next/server';
import { managedConfigSchema } from '../../../../lib/config/schema';
import { writeManagedConfig, readManagedConfig } from '../../../../lib/config/toml-managed-block';

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = managedConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const prev = await readManagedConfig();
    await writeManagedConfig(parsed.data);
    return NextResponse.json({ ok: true, previous: prev.managed });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
