/**
 * Karma-specific signing worker factory.
 * Points to the built worker in dist/ for browser testing.
 */
import Worker from 'web-worker'

export function createSigningWorker(): InstanceType<typeof Worker> {
    return new Worker(
        new URL('../../dist/workers/SigningWorker.browser.mjs', import.meta.url),
        { type: 'module' }
    )
}
