/**
 * Browser-specific signing worker factory.
 */
import Worker from 'web-worker'

export function createSigningWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('./workers/SigningWorker.browser.mjs', import.meta.url),
        { type: 'module' }
    )
}
