import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import React from 'react';

export const metadata: Metadata = {
  title: 'Solana MEV Bot UI',
  description: 'Local control panel for Solana MEV bot operations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-wide text-emerald-400">
              SMB-UI
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link className="hover:text-emerald-300" href="/token-picker">
                Подбор токенов
              </Link>
              <Link className="hover:text-emerald-300" href="/config">
                Конфиг
              </Link>
              <Link className="hover:text-emerald-300" href="/run">
                Запуск и логи
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
