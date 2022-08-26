import { Database } from 'sqlite'
import { toStreamID } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import ServerPersistentStore from '../../src/encryption/ServerPersistentStore'
import { mockContext } from '../test-utils/utils'

describe('ServerPersistentStore', () => {

    let store: ServerPersistentStore

    beforeEach(async () => {
        const clientId = fastWallet().address
        const streamId = toStreamID('0x0000000000000000000000000000000000000001/path')
        store = new ServerPersistentStore({
            context: mockContext(),
            clientId,
            streamId,
            onInit: async (db: Database) => {
                await db.exec('CREATE TABLE IF NOT EXISTS GroupKeys (id TEXT, groupKey TEXT, streamId TEXT);')
            }
        })
    })

    it('happy path', async () => {
        await store.set('foo', 'bar')
        expect(await store.get('foo')).toBe('bar')
    })

    it('no value', async () => {
        expect(await store.get('non-existing')).toBeUndefined()
    })
})
