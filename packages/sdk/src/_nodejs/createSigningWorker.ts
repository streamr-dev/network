/**
 * Node.js-specific signing worker factory.
 */
import Worker from 'web-worker'

export function createSigningWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('./workers/SigningWorker.node.mjs', import.meta.url),
        { type: 'module' }
    )
}
