import LeakDetector from 'jest-leak-detector'
import crypto from 'crypto'
import { GroupKey } from '../../src/stream/encryption/Encryption'
import GroupKeyStore from '../../src/stream/encryption/GroupKeyStore'
import { uid, describeRepeats } from '../utils'

describeRepeats('GroupKeyStore', () => {
    let clientId: string
    let streamId: string
    let store: GroupKeyStore
    let leakDetector: LeakDetector

    beforeEach(() => {
        clientId = `0x${crypto.randomBytes(20).toString('hex')}`
        streamId = uid('stream')
        store = new GroupKeyStore({
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

    it('can set next and use', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.exists()).toBeFalsy()
        await store.setNextGroupKey(groupKey)
        expect(await store.exists()).toBeTruthy()
        expect(await store.useGroupKey()).toEqual([groupKey, undefined])
        expect(await store.useGroupKey()).toEqual([groupKey, undefined])
        const groupKey2 = GroupKey.generate()
        await store.setNextGroupKey(groupKey2)
        expect(await store.useGroupKey()).toEqual([groupKey, groupKey2])
        expect(await store.useGroupKey()).toEqual([groupKey2, undefined])
    })

    it('can set next in parallel and use', async () => {
        const groupKey = GroupKey.generate()
        const groupKey2 = GroupKey.generate()
        await Promise.all([
            store.setNextGroupKey(groupKey),
            store.setNextGroupKey(groupKey2),
        ])
        expect(await store.useGroupKey()).toEqual([groupKey, undefined])
    })
})
