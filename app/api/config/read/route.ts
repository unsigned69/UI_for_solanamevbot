import { NextResponse } from 'next/server';
import { readManagedConfig, readRawConfig } from '../../../../lib/config/toml-managed-block';
import { readBaseAnchorTokens } from '../../../../lib/config/base-anchor-reader';
import { resolveStableMode } from '../../../../lib/config/stable-mode';

export async function GET() {
  try {
    const raw = await readRawConfig();
    const { managed } = await readManagedConfig();
    const stableMode = await resolveStableMode();
    let baseAnchor;
    try {
      baseAnchor = await readBaseAnchorTokens();
    } catch (error) {
      baseAnchor = { error: (error as Error).message };
    }

    return NextResponse.json({
      raw,
      managed,
      baseTokens: baseAnchor?.baseTokens ?? [],
      anchorTokens: baseAnchor?.anchorTokens ?? [],
      baseAnchorError: 'error' in (baseAnchor ?? {}) ? (baseAnchor as any).error : undefined,
      stableMode: stableMode.mode,
      stableMint: stableMode.stableMint ?? undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
