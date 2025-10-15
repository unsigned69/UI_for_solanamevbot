import { NextResponse } from 'next/server';
import { botRunner } from '../../../../lib/runner/process-runner';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (request.headers.get('upgrade') !== 'websocket') {
    return NextResponse.json({ error: 'Expected websocket upgrade' }, { status: 400 });
  }

  const { 0: client, 1: server } = new WebSocketPair();
  const ws = server as unknown as WebSocket;
  ws.accept();

  const unsubscribe = botRunner.subscribe((event) => {
    ws.send(JSON.stringify(event));
  });

  ws.addEventListener('close', () => {
    unsubscribe();
  });

  ws.send(JSON.stringify({ type: 'state', state: botRunner.getStatus().state, status: botRunner.getStatus() }));

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}
