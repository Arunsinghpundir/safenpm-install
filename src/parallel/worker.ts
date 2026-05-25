import { parentPort } from 'node:worker_threads';
import semver from 'semver';
import type { WorkerResultMessage, WorkerTaskMessage } from '../types.js';

if (!parentPort) {
  throw new Error('worker.ts must be run inside a worker thread');
}

parentPort.on('message', (message: WorkerTaskMessage) => {
  if (message.type !== 'filter-versions') return;

  try {
    const candidates = filterVersions(message.versions, message.range);
    const response: WorkerResultMessage = {
      type: 'filter-versions-result',
      id: message.id,
      candidates,
    };
    parentPort!.postMessage(response);
  } catch (error) {
    const response: WorkerResultMessage = {
      type: 'filter-versions-result',
      id: message.id,
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    };
    parentPort!.postMessage(response);
  }
});

function filterVersions(versions: string[], range: string): string[] {
  const valid = versions.filter((v) => semver.valid(v));

  const satisfying = valid.filter((v) =>
    semver.satisfies(v, range, { includePrerelease: true }),
  );

  return [...satisfying].sort((a, b) => semver.rcompare(a, b, true));
}
