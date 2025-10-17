export interface ManagedMintConfig {
  mint: string;
  raydiumPools?: string[];
  meteoraDlmmPools?: string[];
  pumpfunPools?: string[];
  processDelayMs?: number;
  minProcessDelayMs?: number;
  maxProcessDelayMs?: number;
}

export interface ManagedConfig {
  routing: {
    mint_config_list: ManagedMintConfig[];
  };
}
