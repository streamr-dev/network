import LeakDetector from 'jest-leak-detector' // requires weak-napi
import crypto from 'crypto'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { uid, mockContext } from '../test-utils/utils'
import { describeRepeats } from '../test-utils/jest-utils'
import { StreamID, toStreamID } from 'streamr-client-protocol'

describeRepeats('GroupKeyStore', () => {
    let clientId: string
    let streamId: StreamID
    let store: GroupKeyStore
    let leakDetector: LeakDetector

    beforeEach(() => {
        clientId = `0x${crypto.randomBytes(20).toString('hex')}`
        streamId = toStreamID(uid('stream'))
        store = new GroupKeyStore({
            context: mockContext(),
            clientId,
            streamId,
            groupKeys: [],
        })

        leakDetector = new LeakDetector(store)
    })

    afterEach(async () => {
        if (!store) { return }
        await store.clear()
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store = undefined // eslint-disable-line require-atomic-updates
    })

    afterEach(async () => {
        expect(await leakDetector.isLeaking()).toBeFalsy()
    })

    it('can get set and delete', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.exists()).toBeFalsy()
        expect(await store.get(groupKey.id)).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        expect(await store.clear()).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        expect(await store.close()).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        // should only start existing now
        expect(await store.add(groupKey)).toBeTruthy()
        expect(await store.exists()).toBeTruthy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
        expect(await store.clear()).toBeTruthy()
        expect(await store.clear()).toBeFalsy()
        expect(await store.get(groupKey.id)).toBeFalsy()
    })

    it('does not exist until write', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.exists()).toBeFalsy()

        expect(await store.isEmpty()).toBeTruthy()
        expect(await store.exists()).toBeFalsy()
        expect(await store.has(groupKey.id)).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        expect(await store.get(groupKey.id)).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        expect(await store.clear()).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        expect(await store.close()).toBeFalsy()
        expect(await store.exists()).toBeFalsy()
        // should only start existing now
        expect(await store.add(groupKey)).toBeTruthy()
        expect(await store.exists()).toBeTruthy()
    })

    it('can rotate and use', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.exists()).toBeFalsy()
        await store.rotate(groupKey)
        expect(await store.exists()).toBeTruthy()
        expect(await store.useGroupKey()).toEqual([groupKey, undefined])
        expect(await store.useGroupKey()).toEqual([groupKey, undefined])
        const groupKey2 = GroupKey.generate()
        await store.rotate(groupKey2)
        expect(await store.useGroupKey()).toEqual([groupKey, groupKey2])
        expect(await store.useGroupKey()).toEqual([groupKey2, undefined])
    })

    it('generates a new key on first use', async () => {
        const [generatedKey, nextKey] = await store.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(nextKey).toBeUndefined()
    })

    it('only keeps the latest unused key', async () => {
        const groupKey = GroupKey.generate()
        const groupKey2 = GroupKey.generate()
        await store.rotate(groupKey)
        await store.rotate(groupKey2)
        expect(await store.useGroupKey()).toEqual([groupKey2, undefined])
    })

    it('replaces unused rotations', async () => {
        const [generatedKey, queuedKey] = await store.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(queuedKey).toEqual(undefined)

        const groupKey = await store.rotate()
        expect(groupKey).toBeTruthy()
        const groupKey2 = await store.rotate()
        expect(await store.useGroupKey()).toEqual([generatedKey, groupKey2])
    })

    it('handles rotate then rekey', async () => {
        // Set some initial key
        const [generatedKey, queuedKey] = await store.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(queuedKey).toEqual(undefined)

        const rotatedKey = await store.rotate()
        expect(rotatedKey).toBeTruthy()
        const rekey = await store.rekey()
        expect(rekey).toBeTruthy()
        expect(await store.useGroupKey()).toEqual([rekey, undefined])
    })

    it('handles rekey then rotate', async () => {
        // Set some initial key
        const [generatedKey, queuedKey] = await store.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(queuedKey).toEqual(undefined)

        const rekey = await store.rekey()
        expect(rekey).toBeTruthy()
        const rotatedKey = await store.rotate()
        expect(rotatedKey).toBeTruthy()
        expect(await store.useGroupKey()).toEqual([rekey, rotatedKey])
    })
})
