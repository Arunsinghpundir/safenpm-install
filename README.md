# safe-npm

Enterprise-safe npm wrapper that detects registry-blocked package versions (403 / quarantine / unavailable) and automatically falls back to the latest accessible version, persisting fixes via `package.json` overrides.

## Problem

Private npm proxies (JFrog Artifactory, Sonatype Nexus) often block or delay newly published versions. That leads to:

- `npm install` failing with **403 Forbidden**
- Broken CI/CD pipelines
- Manual downgrades and override edits

**safe-npm** automates detection and fallback so installs succeed without manual intervention.

## Install

```bash
npm install
npm run build
npm link
```

## Usage

```bash
safe-npm install
safe-npm install --dry-run
safe-npm install --verbose
safe-npm install --registry https://artifactory.example.com/artifactory/api/npm/npm-virtual/
safe-npm install --legacy-peer-deps
```

### Example flow

**Input** (`package.json`):

```json
{
  "dependencies": {
    "lodash": "^5.0.0"
  }
}
```

**Scenario:** `5.0.2` and `5.0.1` blocked, `5.0.0` accessible.

**Output:**

```
✔ Reading dependencies
✔ Resolving versions
⚠ lodash@5.0.2 blocked by registry
⚠ lodash@5.0.1 blocked by registry
✔ Falling back to lodash@5.0.0
✔ Writing overrides
✔ Running npm install
```

**Result** (`package.json`):

```json
{
  "overrides": {
    "lodash": "5.0.0"
  }
}
```

## Architecture

```
src/
├── cli.ts         # Commander entrypoint, orchestration
├── resolver.ts    # package.json I/O, dependency extraction, plan building
├── registry.ts    # .npmrc parsing, pacote metadata/manifest validation
├── fallback.ts    # Version candidate sorting + blocked-version fallback
├── overrides.ts   # Merge and persist overrides to package.json
├── installer.ts   # npm install execution (execa)
├── logger.ts      # chalk + ora logging
├── errors.ts      # Blocked/network error classification
└── types.ts       # Shared TypeScript contracts
```

### Fallback algorithm

1. Read `dependencies` and `devDependencies` from `package.json`
2. For each package, fetch packument metadata via **pacote**
3. Filter versions satisfying the semver range
4. Sort candidates **descending** (newest first)
5. Validate each version with `pacote.manifest()` until one succeeds
6. On **403 / E403 / Forbidden / unavailable**, try the next lower version
7. Collect packages that required fallback into `overrides`
8. Run `npm install`

### Registry support

- Reads project `.npmrc` and user `~/.npmrc`
- Honors `registry` and `@scope:registry`
- Supports `_authToken` for private registries
- Respects `npm_config_registry` environment variable

## Error handling

| Error type | Behavior |
|------------|----------|
| 403 / Forbidden / blocked | Warn, try next lower version |
| Network (ETIMEDOUT, ENOTFOUND) | Fail fast with clear message |
| No satisfying versions | Fail with semver context |
| All candidates blocked | Fail with summary |

## Future extensions

Designed for later additions without rewriting core flows:

- `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` patching
- CI mode (`--ci`)
- Shared validation cache
- Parallel version probes
- Artifactory-specific API optimizations
- Optional Rust backend

## Development

```bash
npm run build
npm run lint
node dist/cli.js install --dry-run --verbose
```

## License

MIT
