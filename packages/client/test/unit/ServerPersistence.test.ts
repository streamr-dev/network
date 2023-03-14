import { Database } from 'sqlite'
import { randomEthereumAddress } from '@streamr/test-utils'
import ServerPersistence from '../../src/utils/persistence/ServerPersistence'
import { mockLoggerFactory } from '../test-utils/utils'

describe('ServerPersistence', () => {

    let persistence: ServerPersistence<string, string>

    beforeEach(async () => {
        const clientId = randomEthereumAddress()
        persistence = new ServerPersistence({
            loggerFactory: mockLoggerFactory(),
            tableName: 'MockTable',
            clientId,
            onInit: async (db: Database) => {
                await db.exec('CREATE TABLE IF NOT EXISTS MockTable (key_ TEXT, value_ TEXT);')
            }
        })
    })

    afterEach(async () => {
        await persistence.close()
    })

    it('happy path', async () => {
        await persistence.set('foo', 'bar')
        expect(await persistence.get('foo')).toBe('bar')
    })

    it('no value', async () => {
        expect(await persistence.get('non-existing')).toBeUndefined()
    })

    it('can get and set', async () => {
        const key = 'mock-key'
        const value = 'mock-value'
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.get(key)).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.close()).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        // should only start existing now
        await persistence.set(key, value)
        expect(await persistence.exists()).toBeTruthy()
    })

    it('does not exist until write', async () => {
        const key = 'mock-key'
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.get(key)).toBeUndefined()
        expect(await persistence.exists()).toBeFalsy()
        expect(await persistence.close()).toBeFalsy()
        expect(await persistence.exists()).toBeFalsy()
        // should only start existing now
        await persistence.set(key, 'dummy')
        expect(await persistence.exists()).toBeTruthy()
    })
})
