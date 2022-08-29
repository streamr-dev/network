import { Database } from 'sqlite'
import { toStreamID } from 'streamr-client-protocol'
import { fastWallet } from 'streamr-test-utils'
import ServerPersistence from '../../src/utils/persistence/ServerPersistence'
import { mockContext } from '../test-utils/utils'

describe('ServerPersistence', () => {

    let persistence: ServerPersistence

    beforeEach(async () => {
        const clientId = fastWallet().address
        const streamId = toStreamID('0x0000000000000000000000000000000000000001/path')
        persistence = new ServerPersistence({
            context: mockContext(),
            tableName: 'MockTable',
            valueColumnName: 'mockValue',
            clientId,
            streamId,
            onInit: async (db: Database) => {
                await db.exec('CREATE TABLE IF NOT EXISTS MockTable (id TEXT, mockValue TEXT, streamId TEXT);')
            }
        })
    })

    it('happy path', async () => {
        await persistence.set('foo', 'bar')
        expect(await persistence.get('foo')).toBe('bar')
    })

    it('no value', async () => {
        expect(await persistence.get('non-existing')).toBeUndefined()
    })
})
