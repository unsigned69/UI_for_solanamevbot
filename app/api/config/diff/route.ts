import { NextResponse } from 'next/server';
import { managedConfigSchema } from '../../../../lib/config/schema';
import { readManagedConfig } from '../../../../lib/config/toml-managed-block';
import { diffManagedConfigs } from '../../../../lib/config/diff';

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = managedConfigSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const current = await readManagedConfig();
    const diff = diffManagedConfigs(current.managed, parsed.data);
    return NextResponse.json({ diff });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
