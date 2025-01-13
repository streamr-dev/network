import 'reflect-metadata'

import { randomEthereumAddress, randomUserId } from '@streamr/test-utils'
import { toStreamID, UserID } from '@streamr/utils'
import range from 'lodash/range'
import { GroupKey } from '../../src/encryption/GroupKey'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { getLocalGroupKeyStore } from '../test-utils/utils'

describe('LocalGroupKeyStore', () => {
    let ownerId: UserID
    let publisherId: UserID
    let store: LocalGroupKeyStore
    let store2: LocalGroupKeyStore

    beforeEach(() => {
        ownerId = randomUserId()
        publisherId = randomUserId()
        store = getLocalGroupKeyStore(ownerId)
    })

    afterEach(async () => {
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store = undefined
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store2 = undefined
    })

    it('can get and set', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.get(groupKey.id, publisherId)).toBeUndefined()

        await store.set(groupKey.id, publisherId, groupKey.data)
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('key lookup is publisher specific', async () => {
        const groupKey = GroupKey.generate()
        await store.set(groupKey.id, publisherId, groupKey.data)
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
        expect(await store.get(groupKey.id, randomUserId())).toBeUndefined()
    })

    it('key stores are ownerId specific', async () => {
        const ownerId2 = randomUserId()
        store2 = getLocalGroupKeyStore(ownerId2)

        const groupKey = GroupKey.generate()
        await store.set(groupKey.id, publisherId, groupKey.data)
        expect(await store2.get(groupKey.id, publisherId)).toBeUndefined()
        expect(await store.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('can read previously persisted data', async () => {
        const groupKey = GroupKey.generate()
        await store.set(groupKey.id, publisherId, groupKey.data)

        const store2 = getLocalGroupKeyStore(ownerId)
        expect(await store2.get(groupKey.id, publisherId)).toEqual(groupKey)
    })

    it('add multiple keys in parallel', async () => {
        const assignments = range(10).map(() => {
            return { key: GroupKey.generate(), publisherId: randomUserId() }
        })
        await Promise.all(assignments.map(({ key, publisherId }) => store.set(key.id, publisherId, key.data)))
        for (const assignment of assignments) {
            expect(await store.get(assignment.key.id, assignment.publisherId)).toEqual(assignment.key)
        }
    })

    describe('latest encryptionKey id', () => {
        const streamId = toStreamID('/foobar', randomEthereumAddress())
        it('add and get key', async () => {
            await store.setLatestEncryptionKeyId('keyId', publisherId, streamId)
            expect(await store.getLatestEncryptionKeyId(publisherId, streamId)).toEqual('keyId')
            expect(await store.getLatestEncryptionKeyId(randomUserId(), streamId)).toBeUndefined()
            expect(await store.getLatestEncryptionKeyId(publisherId, toStreamID('foobar'))).toBeUndefined()
        })
    })
})
