/**
 * Browser-specific signature validation worker factory.
 */
import Worker from 'web-worker'

export function createSignatureValidationWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('../../dist/workers/SignatureValidationWorker.browser.mjs', import.meta.url),
        { type: 'module' }
    )
}
