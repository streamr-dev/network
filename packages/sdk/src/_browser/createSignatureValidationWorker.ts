/**
 * Browser-specific signature validation worker factory.
 */
import Worker from 'web-worker'

export function createSignatureValidationWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('./workers/SignatureValidationWorker.browser.js', import.meta.url),
        { type: 'module' }
    )
}
