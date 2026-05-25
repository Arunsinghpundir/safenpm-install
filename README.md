# safenpm

Enterprise-safe npm wrapper with **parallel registry validation**, intelligent fallback when versions are blocked, and high-performance multicore orchestration.

Works on **Windows**, **Linux**, **macOS**, and **GitHub Actions** — no platform-specific shell commands.

## Install

```bash
npm install
npm run build
npm link
```

## Commands

```bash
safenpm install
safenpm install --32-core
safenpm install --64-core
safenpm install --all-core
safenpm install --max-core
safenpm install --workers=16
safenpm install --verbose
safenpm install --dry-run
safenpm benchmark
```

## Parallel engine

`safenpm` adds a smart orchestration layer **above** npm (does not replace npm internals):

| Phase | Parallelism |
|-------|-------------|
| Packument fetch | Deduped cache + concurrent I/O |
| Semver filtering | `worker_threads` pool (large version lists) |
| Manifest / accessibility | Adaptive `p-limit` concurrency |
| Fallback discovery | Batched parallel version probes per package |
| Install | Delegated to `npm install` |

### Example output

```
✔ Detected 32 logical cores
✔ Starting 24 workers
✔ Parallel registry validation enabled
✔ Adaptive concurrency enabled

[Worker-1] react@19.2.0 blocked
[Worker-2] lodash@5.0.2 blocked
[Worker-3] next@16.0.0 accessible

✔ Fallback resolved for react → 19.0.0
✔ Fallback resolved for lodash → 5.0.1
✔ Writing overrides
✔ Running npm install (12.4s)
✔ Installation completed in 12.4s
```

## Architecture

```
src/
├── cli.ts
├── installer.ts
├── types.ts
├── parallel/
│   ├── cpuDetector.ts      # Core detection + safe limits
│   ├── concurrency.ts      # Adaptive p-limit controller
│   ├── taskQueue.ts        # Priority async queue
│   ├── workerPool.ts       # worker_threads pool
│   ├── worker.ts           # CPU semver filtering
│   └── scheduler.ts        # Parallel package orchestration
├── resolver/
│   ├── packageJson.ts
│   ├── fallback.ts         # Batched parallel version probes
│   ├── parallelResolver.ts
│   └── overrides.ts
├── registry/
│   ├── config.ts           # .npmrc parsing
│   ├── client.ts           # pacote + retry
│   └── cache.ts            # Packument + accessibility cache
├── benchmark/
│   └── benchmark.ts
└── utils/
    ├── errors.ts
    ├── logger.ts
    └── retry.ts              # Exponential backoff
```

## Features

- **Adaptive concurrency** — throttles on slow network or high memory use
- **Registry cache** — avoids duplicate packument/manifest calls
- **Retry engine** — exponential backoff for transient errors; immediate skip on 403
- **Memory safety** — worker cap from free RAM, max 64 workers
- **Cross-platform** — Node.js only, no bash/PowerShell-specific commands

## Benchmark

```bash
safenpm benchmark
safenpm benchmark --skip-npm-install
```

Reports registry validation time, resolution time, fallback recovery, npm install duration, cache hit rate, and worker count.

## Future extensions

Designed for: Rust workers, distributed cache, monorepo scheduling, lockfile patching (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`), CI mode, enterprise dashboards.

## License

MIT
