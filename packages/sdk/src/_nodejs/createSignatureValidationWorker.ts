/**
 * Node.js-specific signature validation worker factory.
 */
import Worker from 'web-worker'

export function createSignatureValidationWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('./workers/SignatureValidationWorker.node.mjs', import.meta.url),
        { type: 'module' }
    )
}
