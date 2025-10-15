import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-emerald-300">Solana MEV Bot UI</h1>
      <p className="text-slate-300">
        Локальный инструмент для ручного управления Solana MEV-ботом. Все операции выполняются только по запросу
        пользователя без фоновых задач.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/token-picker" className="group rounded-lg border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/60 hover:bg-slate-900">
          <h2 className="mb-2 text-xl font-semibold text-emerald-200 group-hover:text-emerald-300">Подбор токенов</h2>
          <p className="text-sm text-slate-400">Ручные фильтры, dry-run маршрутов и запись выбранных mint в конфиг.</p>
        </Link>
        <Link href="/config" className="group rounded-lg border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/60 hover:bg-slate-900">
          <h2 className="mb-2 text-xl font-semibold text-emerald-200 group-hover:text-emerald-300">Конфиг</h2>
          <p className="text-sm text-slate-400">Чтение base/anchor токенов, редактирование управляемого блока с валидацией и diff.</p>
        </Link>
        <Link href="/run" className="group rounded-lg border border-slate-800 bg-slate-900/60 p-6 transition hover:border-emerald-500/60 hover:bg-slate-900">
          <h2 className="mb-2 text-xl font-semibold text-emerald-200 group-hover:text-emerald-300">Запуск и логи</h2>
          <p className="text-sm text-slate-400">Формирование команды запуска, ALT-флаги, dry-run и поток логов.</p>
        </Link>
      </div>
    </div>
  );
}
