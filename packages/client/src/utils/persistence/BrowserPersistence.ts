import { get, set, createStore, UseStore } from 'idb-keyval'
import { Persistence } from './Persistence'
import { StreamID } from 'streamr-client-protocol'
import { memoize } from 'lodash'

export default class BrowserPersistence implements Persistence<string, string> {
    private getStore: (streamId: StreamID) => UseStore

    constructor({ clientId }: { clientId: string }) {
        this.getStore = memoize((streamId: StreamID) => {
            const dbName = `streamr-client::${clientId}::${streamId}`
            return createStore(dbName, 'GroupKeys')
        })
    }

    async get(key: string, streamId: StreamID): Promise<string | undefined> {
        return get(key, this.getStore(streamId))
    }

    async set(key: string, value: string, streamId: StreamID): Promise<void> {
        await set(key, value, this.getStore(streamId))
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }

    get [Symbol.toStringTag](): string {
        return this.constructor.name
    }
}
