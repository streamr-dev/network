import { Database } from 'sqlite'
import { isRunningInElectron, randomEthereumAddress } from '@streamr/test-utils'
import ServerPersistence from '../../src/utils/persistence/ServerPersistence'
import { mockLoggerFactory } from '../test-utils/utils'

const NAMESPACE = 'MockTable'

describe('ServerPersistence', () => {

    let persistence: ServerPersistence

    beforeEach(async () => {
        const clientId = randomEthereumAddress()
        persistence = await ServerPersistence.createInstance({
            loggerFactory: mockLoggerFactory(),
            clientId,
            namespaces: [NAMESPACE],
            onInit: async (db: Database) => {
                await db.exec(`CREATE TABLE IF NOT EXISTS ${NAMESPACE} (key_ TEXT NOT NULL PRIMARY KEY, value_ TEXT);`)
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

    it('overwrite', async () => {
        await persistence.set('foo', 'value1', NAMESPACE)
        await persistence.set('foo', 'value2', NAMESPACE)
        expect(await persistence.get('foo', NAMESPACE)).toBe('value2')
    })

    it('no value', async () => {
        expect(await persistence.get('non-existing', NAMESPACE)).toBeUndefined()
    })

    it('database does not exist until value set', async () => {
        if (isRunningInElectron()) {
            return
        }
        expect(await persistence.exists()).toBeFalse()
        expect(await persistence.get('mock-key', NAMESPACE)).toBeUndefined()
        expect(await persistence.exists()).toBeFalse()
        await persistence.close()
        expect(await persistence.exists()).toBeFalse()
        await persistence.set('mock-key', 'mock-value', NAMESPACE)
        expect(await persistence.exists()).toBeTrue()
    })
})
