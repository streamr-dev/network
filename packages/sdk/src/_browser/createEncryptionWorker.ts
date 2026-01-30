/**
 * Browser-specific encryption worker factory.
 */
import Worker from 'web-worker'

export function createEncryptionWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('./workers/EncryptionWorker.browser.mjs', import.meta.url),
        { type: 'module' }
    )
}
