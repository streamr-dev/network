/**
 * Node.js-specific Comlink expose wrapper.
 */
import { expose } from 'comlink'
// eslint-disable-next-line no-restricted-imports
import nodeEndpoint from 'comlink/dist/esm/node-adapter'
import { parentPort } from 'worker_threads'

export function exposeWorkerApi<T>(api: T): void {
    expose(api, nodeEndpoint(parentPort!))
}
