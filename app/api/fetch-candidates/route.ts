import { NextResponse } from 'next/server';
import { fetchFiltersSchema } from '../../../lib/types/filter-schema';
import { readBaseAnchorTokens } from '../../../lib/config/base-anchor-reader';
import { fetchCandidatesAcrossDexes } from '../../../lib/adapters/registry';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = fetchFiltersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { baseTokens, anchorTokens } = await readBaseAnchorTokens();
    const filters = parsed.data;
    const candidates = await fetchCandidatesAcrossDexes(filters, baseTokens, anchorTokens);

    const page = filters.page ?? 0;
    const pageSize = filters.pageSize ?? 20;
    const start = page * pageSize;
    const end = start + pageSize;
    const paged = candidates.slice(start, end);

    return NextResponse.json({
      candidates: paged,
      total: candidates.length,
      page,
      pageSize,
      baseTokens,
      anchorTokens,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
