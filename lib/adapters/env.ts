export function resolveParserRpcEndpoint(): string | null {
  return process.env.PARSER_RPC_ENDPOINT ?? process.env.RPC_ENDPOINT ?? null;
}

export function describeParserRpcEndpoint(endpoint?: string | null): string {
  const value = endpoint ?? resolveParserRpcEndpoint();
  return value ?? 'mock://local';
}
