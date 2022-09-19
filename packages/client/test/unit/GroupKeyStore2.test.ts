import crypto from 'crypto'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { getGroupKeyStore, uid } from '../test-utils/utils'
import { addAfterFn } from '../test-utils/jest-utils'
import LeakDetector from 'jest-leak-detector' // requires weak-napi
import { StreamID, toStreamID } from 'streamr-client-protocol'

describe('GroupKeyStore', () => {
    let clientId: string
    let streamId: StreamID
    let store: GroupKeyStore
    let leakDetector: LeakDetector

    const addAfter = addAfterFn()

    beforeEach(() => {
        clientId = `0x${crypto.randomBytes(20).toString('hex')}`
        streamId = toStreamID(uid('stream'))
        store = getGroupKeyStore(streamId, clientId)
        leakDetector = new LeakDetector(store)
    })

    afterEach(async () => {
        if (!store) { return }
        await store.destroy()
        // @ts-expect-error doesn't want us to unassign, but it's ok
        store = undefined // eslint-disable-line require-atomic-updates
    })

    afterEach(async () => {
        expect(await leakDetector.isLeaking()).toBeFalsy()
    })

    it('can get and set', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.has(groupKey.id)).toBeFalsy()
        expect(await store.get(groupKey.id)).toBeFalsy()

        expect(await store.add(groupKey)).toBe(groupKey)
        expect(await store.add(groupKey)).toEqual(groupKey)
        expect(await store.has(groupKey.id)).toBeTruthy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('can add with multiple instances in parallel', async () => {
        const store2 = getGroupKeyStore(streamId, clientId)
        // @ts-expect-error private
        addAfter(() => store2.persistence.destroy())

        for (let i = 0; i < 5; i++) {
            const groupKey = GroupKey.generate()
            /* eslint-disable no-await-in-loop, no-loop-func, promise/always-return */
            const tasks = [
                // test adding to same store in parallel doesn't break
                // add key to store1 twice in parallel
                store.add(groupKey).then(async () => {
                    // immediately check exists in store2
                    expect(await store2.has(groupKey.id)).toBeTruthy()
                }),
                store.add(groupKey).then(async () => {
                    // immediately check exists in store2
                    expect(await store2.has(groupKey.id)).toBeTruthy()
                }),
                // test adding to another store at same time doesn't break
                // add to store2 in parallel
                store2.add(groupKey).then(async () => {
                    // immediately check exists in store1
                    expect(await store.has(groupKey.id)).toBeTruthy()
                }),
            ]

            await Promise.allSettled(tasks)
            await Promise.all(tasks)
            /* eslint-enable no-await-in-loop, no-loop-func, promise/always-return */
        }
    })

    it('does not conflict with other streamIds', async () => {
        const streamId2 = toStreamID(uid('stream'))
        const store2 = getGroupKeyStore(streamId2, clientId)

        // @ts-expect-error private
        addAfter(() => store2.persistence.destroy())

        const groupKey = GroupKey.generate()
        await store.add(groupKey)
        expect(await store2.has(groupKey.id)).toBeFalsy()
        expect(await store2.get(groupKey.id)).toBeFalsy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('does not conflict with other clientIds', async () => {
        const clientId2 = `0x${crypto.randomBytes(20).toString('hex')}`
        const store2 = getGroupKeyStore(streamId, clientId2)

        // @ts-expect-error private
        addAfter(() => store2.persistence.destroy())

        const groupKey = GroupKey.generate()
        await store.add(groupKey)
        expect(await store2.has(groupKey.id)).toBeFalsy()
        expect(await store2.get(groupKey.id)).toBeFalsy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('does not conflict with other clientIds', async () => {
        const clientId2 = `0x${crypto.randomBytes(20).toString('hex')}`
        const store2 = getGroupKeyStore(streamId, clientId2)

        // @ts-expect-error private
        addAfter(() => store2.persistence.destroy())

        const groupKey = GroupKey.generate()
        await store.add(groupKey)
        expect(await store2.has(groupKey.id)).toBeFalsy()
        expect(await store2.get(groupKey.id)).toBeFalsy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('can read previously persisted data', async () => {
        const clientId2 = `0x${crypto.randomBytes(20).toString('hex')}`
        const store2 = getGroupKeyStore(streamId, clientId2)
        const groupKey = GroupKey.generate()

        await store2.add(groupKey)

        const store3 = getGroupKeyStore(streamId, clientId2)
        expect(await store3.get(groupKey.id)).toEqual(groupKey)
    })
})
