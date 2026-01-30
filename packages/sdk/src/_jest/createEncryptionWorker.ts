/**
 * Jest-specific encryption worker factory.
 * Points to the built worker in dist/ for testing.
 */
import Worker from 'web-worker'

export function createEncryptionWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('../../dist/workers/EncryptionWorker.node.mjs', import.meta.url),
        { type: 'module' }
    )
}
