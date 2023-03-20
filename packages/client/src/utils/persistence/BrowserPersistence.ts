import { get, set, createStore, UseStore } from 'idb-keyval'
import { PersistenceContext } from './PersistenceContext'
import { Mapping } from '../Mapping'

export default class BrowserPersistence implements PersistenceContext {
    
    private readonly stores: Mapping<[string], UseStore>

    constructor({ clientId }: { clientId: string }) {
        this.stores = new Mapping(async (namespace: string) => {
            return createStore(`streamr-client::${clientId}`, namespace)
        })
    }

    async get(key: string, namespace: string): Promise<string | undefined> {
        return get(key, await this.stores.get(namespace))
    }

    async set(key: string, value: string, namespace: string): Promise<void> {
        await set(key, value, await this.stores.get(namespace))
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }
}
