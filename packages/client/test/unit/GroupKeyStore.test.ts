import crypto from 'crypto'
import { GroupKey } from '../../src/stream/encryption/Encryption'
import GroupKeyStore from '../../src/stream/encryption/GroupKeyStore'
import { uid, describeRepeats } from '../utils'

describeRepeats('GroupKeyStore', () => {
    let clientId: string
    let streamId: string
    let store: GroupKeyStore

    beforeEach(() => {
        clientId = `0x${crypto.randomBytes(20).toString('hex')}`
        streamId = uid('stream')
        store = new GroupKeyStore({
            clientId,
            streamId,
            groupKeys: [],
        })
    })

    afterEach(async () => {
        if (!store) { return }
        await store.clear()
    })

    it('can get set and delete', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.get(groupKey.id)).toBeFalsy()
        expect(await store.add(groupKey)).toBeTruthy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
        expect(await store.clear()).toBeTruthy()
        expect(await store.clear()).toBeFalsy()
        expect(await store.get(groupKey.id)).toBeFalsy()
    })

    it('can set next and use', async () => {
        const groupKey = GroupKey.generate()
        await store.setNextGroupKey(groupKey)
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
