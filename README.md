# SMB-UI

## Переменные окружения
- `BOT_CMD` — команда запуска процесса бота.
- `BOT_WORKDIR` — рабочая директория процесса.
- `BOT_CONFIG_PATH` — абсолютный путь к TOML-конфигу бота.
- `RPC_ENDPOINT` — основной RPC узел бота.
- `PARSER_RPC_ENDPOINT` — RPC для парсера кандидатов (если не задан, используется `RPC_ENDPOINT`).
- `EXTRA_FLAGS_DEFAULT` — дополнительные флаги запуска (опционально).
- `SMB_UI_CONFIG_LOCK_TTL_MS` — TTL lock-файла конфига в миллисекундах (по умолчанию `120000`, `0` отключает авто-очистку).

## Запуск
1. `npm ci`
2. `npm run lint`
3. `./node_modules/.bin/tsc --noEmit`
4. `npm run build`
5. `npm run dev`

## /api/fetch-candidates
### HTTP 200 (частичный успех)
```json
{
  "candidates": [
    {
      "mint": "So11111111111111111111111111111111111111112",
      "pools": [{ "dex": "raydium", "poolId": "raydium-0-abc123", "poolType": "CPMM" }],
      "tvlUsd": 125000,
      "vol5m": 5500,
      "vol1h": 10900,
      "vol24h": 52000,
      "volatility": 0.0425,
      "estSlippagePct": 0.87,
      "altCost": 4.25,
      "score": 84.1
    }
  ],
  "total": 87,
  "page": 1,
  "pageSize": 50,
  "fetchedAt": "2024-05-12T10:15:30.000Z",
  "baseTokens": ["So111..."],
  "anchorTokens": ["USDH..."],
  "errorsByDex": [
    { "dex": "meteora", "status": 503, "message": "upstream timeout" }
  ],
  "updatedAt": 1715508930000
}
```

### HTTP 503 (полный сбой)
```json
{
  "errorsByDex": [
    { "dex": "pumpfun", "status": 503, "message": "upstream timeout" },
    { "dex": "raydium", "status": 429, "message": "rate limited" }
  ],
  "updatedAt": 1715508999000
}
```

> `errorsByDex` может быть пустым массивом или отсутствовать в ответе 200, если все источники успешны.
