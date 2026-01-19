import { openDB, IDBPDatabase } from 'idb'
import { PersistenceContext, PersistenceContextOptions } from '../utils/persistence/PersistenceContext'

/**
 * This file is a ES module (.mts) instead of CommonJS. It was converted to ESM to resolve
 * an import issue with the `idb` package.
 * 
 * When it was CommonJS the `npm run check` failed with error:
 * "The current file is a CommonJS module whose imports will produce 'require' calls;
 * however, the referenced file is an ECMAScript module and cannot be imported with 'require'.
 * Consider writing a dynamic 'import("idb")' call instead."
 * 
 * Although `idb` has a default export of "index.cjs", switching to ESM fixed the issue.
 * If we find another solution, we may revert this file to CommonJS.
 * 
 * See https://github.com/streamr-dev/network/pull/2848
 */

export class Persistence implements PersistenceContext {
    
    private readonly db: IDBPDatabase

    static async createInstance(opts: PersistenceContextOptions): Promise<Persistence> {
        const db = await openDB(`streamr-sdk::${opts.ownerId}`, 1, {
            upgrade(db) {
                opts.namespaces.forEach((namespace) => db.createObjectStore(namespace))
            }
        })
        return new Persistence(db)
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
