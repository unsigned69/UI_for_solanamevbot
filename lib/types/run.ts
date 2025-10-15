export type BotState = 'IDLE' | 'STARTING' | 'RUNNING' | 'ERROR' | 'STOPPED';

export interface RunPayload {
  dryRun: boolean;
  altOps: { create?: boolean; extend?: boolean; deactivate?: boolean; close?: boolean };
  altAddress?: string;
  accountsSource?: 'auto' | 'manual';
  accountsManual?: string[];
  extraFlags?: string;
}

export interface BotStatus {
  state: BotState;
  pid?: number;
  startedAt?: number;
  message?: string;
  commandPreview?: string;
}
