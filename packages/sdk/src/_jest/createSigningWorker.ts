/**
 * Jest-specific signing worker factory.
 * Points to the built worker in dist/ for testing.
 */
import Worker from 'web-worker'

export function createSigningWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('../../dist/workers/SigningWorker.node.mjs', import.meta.url),
        { type: 'module' }
    )
}
