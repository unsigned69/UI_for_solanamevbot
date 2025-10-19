'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ValidationReport } from '../../lib/config/validate';
import type { ManagedConfig } from '../../lib/types/config';
import type { StableMode } from '../../lib/types/stable-mode';

interface ReadResponse {
  raw: string;
  managed: ManagedConfig;
  baseTokens: string[];
  anchorTokens: string[];
  baseAnchorError?: string;
  stableMode?: StableMode;
  stableMint?: string;
}

export default function ConfigClient() {
  const [readState, setReadState] = useState<ReadResponse | null>(null);
  const [managedText, setManagedText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [diffText, setDiffText] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/config/read');
      const data = await res.json();
      setReadState(data);
      setManagedText(JSON.stringify(data.managed, null, 2));
    })();
  }, []);

  const baseTokens = readState?.baseTokens ?? [];
  const anchorTokens = readState?.anchorTokens ?? [];

  const parsedManaged = useMemo(() => {
    try {
      return JSON.parse(managedText) as ManagedConfig;
    } catch (error) {
      return null;
    }
  }, [managedText]);

  const formatValidation = useCallback((report: ValidationReport) => {
    if (!report) {
      return null;
    }
    if (!report.ok) {
      return `Ошибки: ${(report.errors ?? []).join('; ')}`;
    }
    const base = `OK. ALT ~${report.altCostEstimate}, compute ~${report.computeUnitsEstimate}.`;
    return report.warnings?.length ? `${base} Предупреждения: ${report.warnings.join('; ')}` : base;
  }, []);

  const handleValidate = async () => {
    setValidationMessage(null);
    if (!parsedManaged) {
      setValidationMessage('Некорректный JSON.');
      return;
    }
    const res = await fetch('/api/config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedManaged),
    });
    const data = (await res.json()) as ValidationReport | { error?: string };
    if (!res.ok) {
      const errorMessage = 'error' in data ? data.error : undefined;
      setValidationMessage(errorMessage ?? 'Ошибка валидации');
      return;
    }
    setValidationMessage(formatValidation(data as ValidationReport));
  };

  const handleDiff = async () => {
    setDiffText(null);
    if (!parsedManaged) {
      setDiffText('Некорректный JSON.');
      return;
    }
    const res = await fetch('/api/config/diff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedManaged),
    });
    const data = await res.json();
    if (!res.ok) {
      setDiffText(data.error ?? 'Не удалось получить diff');
      return;
    }
    setDiffText(data.diff ?? 'No diff');
  };

  const handleSave = async () => {
    setStatusMessage(null);
    if (!parsedManaged) {
      setStatusMessage('Некорректный JSON. Сохранение невозможно.');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/config/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedManaged),
      });
      const data = await res.json();
      if (!res.ok) {
        const errorMessage = Array.isArray(data.error) ? data.error.join('; ') : data.error;
        throw new Error(errorMessage ?? 'Не удалось сохранить конфиг');
      }
      if (data.diff) {
        setDiffText(data.diff);
      }
      if (data.validation) {
        setValidationMessage(formatValidation(data.validation as ValidationReport));
      }
      if (data.skipped) {
        setStatusMessage('Изменений не обнаружено. Файл конфига не тронут.');
      } else {
        setStatusMessage(
          `Управляемый блок сохранён.${data.backupPath ? ` Бэкап: ${data.backupPath}.` : ''}`,
        );
      }
    } catch (error) {
      setStatusMessage((error as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-emerald-300">Конфиг бота</h1>
        <p className="text-sm text-slate-400">
          UI редактирует только управляемый блок между маркерами. Base/Anchor токены отображаются ниже и настраиваются вручную
          в файле TOML.
        </p>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-lg font-semibold text-emerald-200">Base / Anchor (read-only)</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-slate-400">Base tokens</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-200">
              {baseTokens.length ? baseTokens.map((mint) => <li key={mint}>{mint}</li>) : <li className="text-slate-500">—</li>}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-400">Anchor tokens</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-200">
              {anchorTokens.length ? anchorTokens.map((mint) => <li key={mint}>{mint}</li>) : <li className="text-slate-500">—</li>}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Редактируйте вручную в конфиге. UI не изменяет эти значения.</p>
        {readState?.baseAnchorError && (
          <div className="mt-3 rounded border border-red-500/60 bg-red-900/20 p-3 text-sm text-red-200">
            {readState.baseAnchorError}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-emerald-200">Управляемый блок</h2>
          <div className="flex gap-2 text-sm">
            <button className="rounded border border-slate-700 px-3 py-1" onClick={handleValidate}>
              Dry-валидация
            </button>
            <button className="rounded border border-slate-700 px-3 py-1" onClick={handleDiff}>
              Diff
            </button>
            <button
              className="rounded bg-emerald-500 px-3 py-1 font-semibold text-slate-900 disabled:opacity-60"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </div>
        <textarea
          className="h-80 w-full rounded border border-slate-800 bg-slate-950/60 p-3 font-mono text-sm text-slate-200"
          value={managedText}
          onChange={(event) => setManagedText(event.target.value)}
        />
        {validationMessage && <p className="text-sm text-emerald-300">{validationMessage}</p>}
        {diffText && (
          <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-950/80 p-3 text-xs text-slate-200">
            {diffText}
          </pre>
        )}
        {statusMessage && <p className="text-sm text-slate-300">{statusMessage}</p>}
      </section>
    </div>
  );
}
