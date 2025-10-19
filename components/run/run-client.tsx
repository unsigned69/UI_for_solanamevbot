'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotStatus } from '../../lib/types/run';
import type { RunnerEvent } from '../../lib/runner/process-runner';

interface RunnerEventLog {
  stream: 'stdout' | 'stderr';
  message: string;
}

export default function RunClient() {
  const [status, setStatus] = useState<BotStatus>({ state: 'IDLE' });
  const [dryRun, setDryRun] = useState(false);
  const [altOps, setAltOps] = useState({ create: false, extend: false, deactivate: false, close: false });
  const [altAddress, setAltAddress] = useState('');
  const [accountsSource, setAccountsSource] = useState<'auto' | 'manual'>('auto');
  const [accountsManual, setAccountsManual] = useState('');
  const [extraFlags, setExtraFlags] = useState('');
  const [logs, setLogs] = useState<RunnerEventLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/bot/status')
      .then((res) => res.json())
      .then((data) => {
        if (data?.status) {
          setStatus(data.status);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let isActive = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      if (!isActive) {
        return;
      }
      if (reconnectTimer !== null) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 500);
    };

    const connect = () => {
      if (!isActive) {
        return;
      }
      const ws = new WebSocket(`${window.location.origin.replace('http', 'ws')}/api/bot/attach-logs`);
      socket = ws;

      ws.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data) as RunnerEvent;
          if (data.type === 'state') {
            setStatus(data.status);
          } else if (data.type === 'log') {
            const log: RunnerEventLog = {
              stream: data.stream as RunnerEventLog['stream'],
              message: String(data.message ?? ''),
            };
            setLogs((prev: RunnerEventLog[]) => {
              const next: RunnerEventLog[] = [...prev, log];
              return next.length > 2000 ? next.slice(-2000) : next;
            });
          }
        } catch (error) {
          setLogs((prev: RunnerEventLog[]) => {
            const next: RunnerEventLog[] = [
              ...prev,
              { stream: 'stderr', message: `WS parse error: ${(error as Error).message}` },
            ];
            return next.length > 2000 ? next.slice(-2000) : next;
          });
        }
      });

      ws.addEventListener('close', () => {
        if (!isActive) {
          return;
        }
        scheduleReconnect();
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    };

    connect();

    return () => {
      isActive = false;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const toggleAltOp = (key: keyof typeof altOps) => {
    setAltOps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRun = async () => {
    setError(null);
    setIsRunningCommand(true);
    try {
      const payload = {
        dryRun,
        altOps: dryRun ? {} : altOps,
        altAddress: altAddress || undefined,
        accountsSource,
        accountsManual: accountsSource === 'manual' ? accountsManual.split('\n').map((l) => l.trim()).filter(Boolean) : undefined,
        extraFlags: extraFlags || undefined,
      };
      const res = await fetch('/api/bot/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Не удалось запустить бот');
      }
      setStatus(data.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRunningCommand(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    setIsRunningCommand(true);
    try {
      const res = await fetch('/api/bot/stop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Не удалось остановить бот');
      }
      setStatus(data.status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsRunningCommand(false);
    }
  };

  useEffect(() => {
    if (dryRun) {
      setAltOps({ create: false, extend: false, deactivate: false, close: false });
    }
  }, [dryRun]);

  const commandPreview = useMemo(() => status.commandPreview ?? '—', [status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Запуск и логи</h1>
        <p className="text-sm text-slate-400">
          Соберите команду запуска вручную. Dry-run блокирует ALT операции. При активных ALT-флагах будет показано
          подтверждение (в реальной интеграции).
        </p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <h2 className="text-lg font-semibold text-emerald-200">Параметры запуска</h2>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
            Dry-run (без ончейн-записи)
          </label>

          <div className="space-y-2">
            <p className="text-xs uppercase text-slate-400">ALT операции</p>
            {(['create', 'extend', 'deactivate', 'close'] as Array<keyof typeof altOps>).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={altOps[key]}
                  disabled={dryRun}
                  onChange={() => toggleAltOp(key)}
                />
                {key === 'create' && 'Создать ALT'}
                {key === 'extend' && 'Расширить ALT'}
                {key === 'deactivate' && 'Деактивировать ALT'}
                {key === 'close' && 'Закрыть ALT'}
              </label>
            ))}
            {dryRun && <p className="text-xs text-slate-500">ALT операции недоступны в режиме dry-run.</p>}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-slate-400">ALT Address</span>
            <input
              className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1"
              value={altAddress}
              onChange={(e) => setAltAddress(e.target.value)}
              placeholder="Опционально"
            />
          </label>

          <div className="space-y-2 text-sm">
            <span className="text-xs uppercase text-slate-400">Accounts Source</span>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accounts-source"
                value="auto"
                checked={accountsSource === 'auto'}
                onChange={() => setAccountsSource('auto')}
              />
              Авто из конфига
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="accounts-source"
                value="manual"
                checked={accountsSource === 'manual'}
                onChange={() => setAccountsSource('manual')}
              />
              Вручную
            </label>
            {accountsSource === 'manual' && (
              <textarea
                className="h-24 w-full rounded border border-slate-800 bg-slate-950/60 p-2 font-mono text-xs"
                value={accountsManual}
                onChange={(e) => setAccountsManual(e.target.value)}
                placeholder="По одному адресу на строку"
              />
            )}
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase text-slate-400">Extra flags</span>
            <input
              className="rounded border border-slate-800 bg-slate-950/60 px-2 py-1"
              value={extraFlags}
              onChange={(e) => setExtraFlags(e.target.value)}
              placeholder="--custom-flag"
            />
          </label>

          <div className="flex gap-3">
            <button
              className="flex-1 rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
              onClick={handleRun}
              disabled={isRunningCommand}
            >
              Запустить
            </button>
            <button
              className="flex-1 rounded border border-red-500 px-4 py-2 text-sm font-semibold text-red-300 disabled:opacity-60"
              onClick={handleStop}
              disabled={isRunningCommand}
            >
              Остановить
            </button>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}

          <div className="rounded border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
            <p className="text-xs uppercase text-slate-500">Статус</p>
            <p className="text-lg font-semibold text-emerald-300">{status.state}</p>
            {status.pid && <p>PID: {status.pid}</p>}
            {status.startedAt && <p>Запущен: {new Date(status.startedAt).toLocaleString()}</p>}
            <p className="mt-2 text-xs uppercase text-slate-500">Команда</p>
            <p className="font-mono text-xs">{commandPreview}</p>
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-200">Логи</h2>
            <button
              className="rounded border border-slate-700 px-3 py-1 text-xs"
              onClick={() => setLogs([])}
            >
              Очистить
            </button>
          </div>
          <div ref={logContainerRef} className="h-[480px] overflow-y-auto rounded border border-slate-800 bg-slate-950/80 p-3">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">Логи появятся после запуска или при подключении к процессу.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {logs.map((log, index) => (
                  <li key={`${index}-${log.message.slice(0, 8)}`} className={log.stream === 'stderr' ? 'text-red-300' : 'text-slate-200'}>
                    {log.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
