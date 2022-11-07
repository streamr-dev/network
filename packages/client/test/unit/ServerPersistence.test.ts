import { Database } from 'sqlite'
import { toStreamID } from 'streamr-client-protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import ServerPersistence from '../../src/utils/persistence/ServerPersistence'
import { mockLoggerFactory } from '../test-utils/utils'

const streamId = toStreamID('0x0000000000000000000000000000000000000001/path')

describe('ServerPersistence', () => {

    let persistence: ServerPersistence

    beforeEach(async () => {
        const clientId = randomEthereumAddress()
        persistence = new ServerPersistence({
            loggerFactory: mockLoggerFactory(),
            tableName: 'MockTable',
            valueColumnName: 'mockValue',
            clientId,
            onInit: async (db: Database) => {
                await db.exec('CREATE TABLE IF NOT EXISTS MockTable (id TEXT, mockValue TEXT, streamId TEXT);')
            }
        })
    })

    afterEach(async () => {
        await persistence.close()
    })

    it('happy path', async () => {
        await persistence.set('foo', 'bar', streamId)
        expect(await persistence.get('foo', streamId)).toBe('bar')
    })

    it('no value', async () => {
        expect(await persistence.get('non-existing', streamId)).toBeUndefined()
    })

    it('can get and set', async () => {
        const key = 'mock-key'
        const value = 'mock-value'
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.get(key, streamId)).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.close()).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        // should only start existing now
        await persistence.set(key, value, streamId)
        expect(await persistence.exists()).toBeTruthy()
    })

    it('does not exist until write', async () => {
        const key = 'mock-key'
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.get(key, streamId)).toBeUndefined()
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.close()).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        // should only start existing now
        await persistence.set(key, 'dummy', streamId)
        expect(await persistence.exists()).toBeTruthy()
    })
})
