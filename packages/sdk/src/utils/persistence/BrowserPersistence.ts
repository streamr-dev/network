import { openDB, IDBPDatabase } from 'idb'
import { PersistenceContext, PersistenceContextOptions } from './PersistenceContext'

export default class BrowserPersistence implements PersistenceContext {
    private readonly db: IDBPDatabase

    static async createInstance(opts: PersistenceContextOptions): Promise<BrowserPersistence> {
        const db = await openDB(`streamr-sdk::${opts.ownerId}`, 1, {
            upgrade(db) {
                opts.namespaces.forEach((namespace) => db.createObjectStore(namespace))
            }
        })
        return new BrowserPersistence(db)
    }

    private constructor(db: IDBPDatabase) {
        this.db = db
    }

    async get(key: string, namespace: string): Promise<string | undefined> {
        return this.db.get(namespace, key)
    }

    async set(key: string, value: string, namespace: string): Promise<void> {
        await this.db.put(namespace, value, key)
    }

    // eslint-disable-next-line class-methods-use-this
    async close(): Promise<void> {
        // noop
    }
}
