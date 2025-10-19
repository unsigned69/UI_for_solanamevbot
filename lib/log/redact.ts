import path from 'path';

type Primitive = string | number | boolean | null | undefined;

function collectSensitiveValues(): string[] {
  const values = new Set<string>();
  const configPath = process.env.BOT_CONFIG_PATH;
  if (configPath) {
    const resolved = path.resolve(configPath);
    values.add(resolved);
    values.add(path.normalize(resolved));
  }
  const workdir = process.env.BOT_WORKDIR;
  if (workdir) {
    const resolved = path.resolve(workdir);
    values.add(resolved);
    values.add(path.normalize(resolved));
  }
  return Array.from(values).filter(Boolean);
}

const SENSITIVE_VALUES = collectSensitiveValues();

function redactConfigFlag(value: string): string {
  return value.replace(/(--config(?:=|\s+))("[^"]+"|'[^']+'|\S+)/gi, (_match, prefix) => `${prefix}***`);
}

function redactSensitiveStrings(value: string): string {
  let result = redactConfigFlag(value);
  for (const sensitive of SENSITIVE_VALUES) {
    if (!sensitive) {
      continue;
    }
    result = result.split(sensitive).join('***');
  }
  return result;
}

function redactPrimitive(value: Primitive): Primitive {
  if (typeof value === 'string') {
    return redactSensitiveStrings(value);
  }
  return value;
}

export function redactValue<T>(value: T): T {
  if (value == null) {
    return value;
  }
  if (typeof value === 'string') {
    return redactSensitiveStrings(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item)) as T;
  }
  if (value instanceof Date) {
    return redactSensitiveStrings(value.toISOString()) as T;
  }
  if (typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(input)) {
      output[key] = redactValue(entry);
    }
    return output as T;
  }
  return redactPrimitive(value as Primitive) as T;
}

export function redactMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!meta) {
    return {};
  }
  const redacted = redactValue(meta);
  if (!redacted || typeof redacted !== 'object' || Array.isArray(redacted)) {
    return { value: redacted } as Record<string, unknown>;
  }
  return redacted as Record<string, unknown>;
}
