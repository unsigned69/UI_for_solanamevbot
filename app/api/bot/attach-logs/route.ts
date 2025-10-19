import { NextResponse } from 'next/server';
import { botRunner } from '../../../../lib/runner/process-runner';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (request.headers.get('upgrade') !== 'websocket') {
    return NextResponse.json({ error: 'Expected websocket upgrade' }, { status: 400 });
  }

  const globalPair = (globalThis as { WebSocketPair?: new () => { 0: WebSocket; 1: WebSocket & { accept?: () => void } } }).WebSocketPair;
  if (!globalPair) {
    return NextResponse.json({ error: 'WebSocketPair не поддерживается в этой среде' }, { status: 500 });
  }
  const pair = new globalPair();
  const client = pair[0];
  const server = pair[1];
  server.accept?.();

  const unsubscribe = botRunner.subscribe((event) => {
    server.send(JSON.stringify(event));
  });

  server.addEventListener('close', () => {
    unsubscribe();
  });

  server.send(JSON.stringify({ type: 'state', state: botRunner.getStatus().state, status: botRunner.getStatus() }));

  const response = new Response(null, { status: 101 });
  (response as any).webSocket = client;
  return response;
}
