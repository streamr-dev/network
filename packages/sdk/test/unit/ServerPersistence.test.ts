import { randomUserId, testOnlyInNodeJs } from '@streamr/test-utils'
import range from 'lodash/range'
import { join } from 'path'
import { Database } from 'sqlite'
import ServerPersistence from '../../src/utils/persistence/ServerPersistence'
import { mockLoggerFactory } from '../test-utils/utils'

const NAMESPACE = 'MockTable'

describe('ServerPersistence', () => {
    let persistence: ServerPersistence

    beforeEach(async () => {
        const ownerId = randomUserId()
        persistence = await ServerPersistence.createInstance({
            loggerFactory: mockLoggerFactory(),
            ownerId,
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

    testOnlyInNodeJs('database does not exist until value set', async () => {
        expect(await persistence.exists()).toBeFalse()
        expect(await persistence.get('mock-key', NAMESPACE)).toBeUndefined()
        expect(await persistence.exists()).toBeFalse()
        await persistence.close()
        expect(await persistence.exists()).toBeFalse()
        await persistence.set('mock-key', 'mock-value', NAMESPACE)
        expect(await persistence.exists()).toBeTrue()
    })

    // enable when NET-1057 done
    it.skip('concurrency', async () => {
        const instanceCount = 10
        const ownerId = randomUserId()
        const values = await Promise.all(
            range(instanceCount).map(async (i: number) => {
                const instance = await ServerPersistence.createInstance({
                    loggerFactory: mockLoggerFactory(),
                    ownerId,
                    namespaces: ['EncryptionKeys'],
                    migrationsPath: join(__dirname, '../../src/encryption/migrations')
                })
                await instance.set('key', `value${i}`, 'EncryptionKeys')
                const value = await instance.get('key', 'EncryptionKeys')
                return value
            })
        )
        expect(values).toEqual(range(instanceCount).map((i: number) => `value${i}`))
    })
})
