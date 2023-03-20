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
                await db.exec('CREATE TABLE IF NOT EXISTS MockTable (key_ TEXT NOT NULL PRIMARY KEY, value_ TEXT);')
            }
        })
    })

    afterEach(async () => {
        await persistence.close()
    })

    it('set and get', async () => {
        await persistence.set('foo', 'bar')
        expect(await persistence.get('foo')).toBe('bar')
    })

    it('overwrite', async () => {
        await persistence.set('foo', 'value1')
        await persistence.set('foo', 'value2')
        expect(await persistence.get('foo')).toBe('value2')
    })

    it('no value', async () => {
        expect(await persistence.get('non-existing')).toBeUndefined()
    })

    it('database does not exist until value set', async () => {
        expect(await persistence.exists()).toBeFalse()
        expect(await persistence.get('mock-key')).toBeUndefined()
        expect(await persistence.exists()).toBeFalse()
        await persistence.close()
        expect(await persistence.exists()).toBeFalse()
        await persistence.set('mock-key', 'mock-value')
        expect(await persistence.exists()).toBeTrue()
    })
})
