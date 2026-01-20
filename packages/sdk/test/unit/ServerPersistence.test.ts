import { randomUserId, testOnlyInNodeJs } from '@streamr/test-utils'
import range from 'lodash/range'
import { Database } from 'sqlite'
import { Persistence } from '../../src/_nodejs/Persistence'
import { mockLoggerFactory } from '../test-utils/utils'

const NAMESPACE = 'MockTable'

describe('Persistence', () => {

    let persistence: Persistence

    beforeEach(async () => {
        const ownerId = randomUserId()
        persistence = await Persistence.createInstance({
            loggerFactory: mockLoggerFactory(),
            ownerId,
            namespaces: [NAMESPACE],
            onInit: async (db) => {
                await (db as Database).exec(`CREATE TABLE IF NOT EXISTS ${NAMESPACE} (key_ TEXT NOT NULL PRIMARY KEY, value_ TEXT);`)
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
        const values = await Promise.all(range(instanceCount).map(async (i: number) => {
            const instance = await Persistence.createInstance({
                loggerFactory: mockLoggerFactory(),
                ownerId,
                namespaces: ['EncryptionKeys'],
                migrationsUrl: new URL('../../src/encryption/migrations', `file://${__dirname}/`),
            })
            await instance.set('key', `value${i}`, 'EncryptionKeys')
            const value = await instance.get('key', 'EncryptionKeys')
            return value
        }))
        expect(values).toEqual(range(instanceCount).map((i: number) => `value${i}`))
    })
})
