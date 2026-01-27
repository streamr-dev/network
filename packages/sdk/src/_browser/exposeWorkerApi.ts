/**
 * Browser-specific Comlink expose wrapper.
 */
import { expose } from 'comlink'

export function exposeWorkerApi<T>(api: T): void {
    expose(api)
}
