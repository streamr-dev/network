import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { getGroupKeyStore, uid } from '../test-utils/utils'
import { addAfterFn } from '../test-utils/jest-utils'
import LeakDetector from 'jest-leak-detector' // requires weak-napi
import { StreamID, toStreamID } from 'streamr-client-protocol'
import { randomEthereumAddress } from 'streamr-test-utils'

describe('GroupKeyStore', () => {
    let clientId: string
    let streamId: StreamID
    let store: GroupKeyStore
    let leakDetector: LeakDetector

    const addAfter = addAfterFn()

    beforeEach(() => {
        clientId = randomEthereumAddress()
        streamId = toStreamID(uid('stream'))
        store = getGroupKeyStore(clientId)
        leakDetector = new LeakDetector(store)
    })

    afterEach(async () => {
        await store.stop()
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store = undefined // eslint-disable-line require-atomic-updates
    })

    afterEach(async () => {
        expect(await leakDetector.isLeaking()).toBeFalsy()
    })

    it('can get and set', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.get(groupKey.id, streamId)).toBeFalsy()

        await store.add(groupKey, streamId)
        expect(await store.get(groupKey.id, streamId)).toEqual(groupKey)
    })

    it('does not conflict with other streamIds', async () => {
        const groupKey = GroupKey.generate()
        await store.add(groupKey, streamId)
        expect(await store.get(groupKey.id, streamId)).toEqual(groupKey)
        expect(await store.get(groupKey.id, toStreamID('other-stream'))).toBeFalsy()
    })

    it('does not conflict with other clientIds', async () => {
        const clientId2 = randomEthereumAddress()
        const store2 = getGroupKeyStore(clientId2)

        addAfter(() => store2.stop())

        const groupKey = GroupKey.generate()
        await store.add(groupKey, streamId)
        expect(await store2.get(groupKey.id, streamId)).toBeFalsy()
        expect(await store.get(groupKey.id, streamId)).toEqual(groupKey)
    })

    it('can read previously persisted data', async () => {
        const clientId2 = randomEthereumAddress()
        const store2 = getGroupKeyStore(clientId2)
        const groupKey = GroupKey.generate()

        await store2.add(groupKey, streamId)

        const store3 = getGroupKeyStore(clientId2)
        expect(await store3.get(groupKey.id, streamId)).toEqual(groupKey)
    })
})
