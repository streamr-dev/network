import { Database } from 'sqlite'
import { randomEthereumAddress } from '@streamr/test-utils'
import ServerPersistence from '../../src/utils/persistence/ServerPersistence'
import { mockLoggerFactory } from '../test-utils/utils'

const NAMESPACE = 'MockTable'

describe('ServerPersistence', () => {

    let persistence: ServerPersistence<string, string>

    beforeEach(async () => {
        const clientId = randomEthereumAddress()
        persistence = new ServerPersistence({
            loggerFactory: mockLoggerFactory(),
            clientId,
            onInit: async (db: Database) => {
                await db.exec(`CREATE TABLE IF NOT EXISTS ${NAMESPACE} (key_ TEXT, value_ TEXT);`)
            }
        })
    })

    afterEach(async () => {
        await persistence.close()
    })

    it('set and get', async () => {
        await persistence.set('foo', 'bar', NAMESPACE)
        expect(await persistence.get('foo', NAMESPACE)).toBe('bar')
    })

    it('no value', async () => {
        expect(await persistence.get('non-existing', NAMESPACE)).toBeUndefined()
    })

    it('database does not exist until value set', async () => {
        expect(await persistence.exists()).toBeFalse()
        expect(await persistence.get('mock-key', NAMESPACE)).toBeUndefined()
        expect(await persistence.exists()).toBeFalse()
        await persistence.close()
        expect(await persistence.exists()).toBeFalse()
        await persistence.set('mock-key', 'mock-value', NAMESPACE)
        expect(await persistence.exists()).toBeTrue()
    })
})
