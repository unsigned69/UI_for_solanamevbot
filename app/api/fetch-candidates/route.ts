import { NextResponse } from 'next/server';
import { fetchFiltersSchema } from '../../../lib/types/filter-schema';
import { fetchCandidateSnapshot } from '../../../lib/services/fetch-candidates';

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = fetchFiltersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const filters = parsed.data;
    // NOTE: этот роут независим от статуса процесса бота; не импортировать runner.
    const snapshot = await fetchCandidateSnapshot(filters);
    return NextResponse.json(snapshot.payload, { status: snapshot.status });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
