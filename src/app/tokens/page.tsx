import { Suspense } from 'react';
import TokensClient from './client';

export const dynamic = 'force-dynamic';

export default function TokensPage() {
  return (
    <Suspense
      fallback={
        <main className="tokens-page">
          <h1>Solana Tokens Dashboard</h1>
          <p className="status">Loading filters…</p>
        </main>
      }
    >
      <TokensClient />
    </Suspense>
  );
}
