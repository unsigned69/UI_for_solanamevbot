import { NextResponse } from 'next/server';
import { fetchFiltersSchema } from '../../../lib/types/filter-schema';
import { fetchCandidateSnapshot } from '../../../lib/services/fetch-candidates';
import { uiLogger } from '../../../lib/log/logger';
import { withApiLogging } from '../../../lib/log/with-api-logging';

export const runtime = 'nodejs';

async function postHandler(request: Request) {
  const body = await request.json();
  const parsed = fetchFiltersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const startedAt = Date.now();
  uiLogger.info('fetch_candidates_request_received', { filters: parsed.data });

  try {
    const filters = parsed.data;
    // NOTE: этот роут независим от статуса процесса бота; не импортировать runner.
    const snapshot = await fetchCandidateSnapshot(filters);
    const durationMs = Date.now() - startedAt;
    const count = 'candidates' in snapshot.payload ? snapshot.payload.candidates.length : 0;
    const errorsSummary = snapshot.payload.errorsByDex.reduce<Record<string, number | undefined>>((acc, item) => {
      acc[item.dex] = item.status;
      return acc;
    }, {});
    uiLogger.info('fetch_candidates_response_sent', {
      status: snapshot.status,
      count,
      errorsByDex: errorsSummary,
      duration_ms: durationMs,
    });
    return NextResponse.json(snapshot.payload, { status: snapshot.status });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = (error as Error).message;
    uiLogger.error('fetch_candidates_response_sent', message, { status: 400, duration_ms: durationMs });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const POST = withApiLogging(postHandler, { routeId: '/api/fetch-candidates' });
