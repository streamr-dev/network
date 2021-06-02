import crypto from 'crypto'
import { mkdtemp, rmdir, copyFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { GroupKey } from '../../src/stream/encryption/Encryption'
import GroupKeyStore, { GroupKeyPersistence } from '../../src/stream/encryption/GroupKeyStore'
import { uid, addAfterFn, describeRepeats } from '../utils'

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

describeRepeats('PersistentStore', () => {
    let clientId: string
    let streamId: string
    let store: GroupKeyPersistence

    const addAfter = addAfterFn()

    beforeEach(() => {
        clientId = `0x${crypto.randomBytes(20).toString('hex')}`
        streamId = uid('stream')
        store = new GroupKeyPersistence({
            clientId,
            streamId,
        })
    })

    afterEach(async () => {
        if (!store) { return }
        await store.destroy()
    })

    it('can get set and delete', async () => {
        const groupKey = GroupKey.generate()
        expect(await store.has(groupKey.id)).toBeFalsy()
        expect(await store.size()).toBe(0)
        expect(await store.get(groupKey.id)).toBeFalsy()
        expect(await store.delete(groupKey.id)).toBeFalsy()
        expect(await store.clear()).toBeFalsy()

        expect(await store.add(groupKey)).toBeTruthy()
        expect(await store.add(groupKey)).toBeFalsy()
        expect(await store.has(groupKey.id)).toBeTruthy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
        expect(await store.size()).toBe(1)
        expect(await store.delete(groupKey.id)).toBeTruthy()

        expect(await store.has(groupKey.id)).toBeFalsy()
        expect(await store.size()).toBe(0)

        expect(await store.get(groupKey.id)).toBeFalsy()
        expect(await store.delete(groupKey.id)).toBeFalsy()
        expect(await store.add(groupKey)).toBeTruthy()
        expect(await store.size()).toBe(1)
        expect(await store.clear()).toBeTruthy()
        expect(await store.size()).toBe(0)
    })

    it('can get set and delete with multiple instances in parallel', async () => {
        const store2 = new GroupKeyPersistence({
            clientId,
            streamId,
        })
        addAfter(() => store2.destroy())

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
        const streamId2 = uid('stream')
        const store2 = new GroupKeyPersistence({
            clientId,
            streamId: streamId2,
        })

        addAfter(() => store2.destroy())

        const groupKey = GroupKey.generate()
        await store.add(groupKey)
        expect(await store2.has(groupKey.id)).toBeFalsy()
        expect(await store2.get(groupKey.id)).toBeFalsy()
        expect(await store2.size()).toBe(0)
        expect(await store2.delete(groupKey.id)).toBeFalsy()
        expect(await store2.clear()).toBeFalsy()
        expect(await store2.clear()).toBeFalsy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('does not conflict with other clientIds', async () => {
        const clientId2 = `0x${crypto.randomBytes(20).toString('hex')}`
        const store2 = new GroupKeyPersistence({
            clientId: clientId2,
            streamId,
        })

        addAfter(() => store2.destroy())

        const groupKey = GroupKey.generate()
        await store.add(groupKey)
        expect(await store2.has(groupKey.id)).toBeFalsy()
        expect(await store2.get(groupKey.id)).toBeFalsy()
        expect(await store2.size()).toBe(0)
        expect(await store2.delete(groupKey.id)).toBeFalsy()
        expect(await store2.clear()).toBeFalsy()
        expect(await store2.clear()).toBeFalsy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('does not conflict with other clientIds', async () => {
        const clientId2 = `0x${crypto.randomBytes(20).toString('hex')}`
        const store2 = new GroupKeyPersistence({
            clientId: clientId2,
            streamId,
        })

        addAfter(() => store2.destroy())

        const groupKey = GroupKey.generate()
        await store.add(groupKey)
        expect(await store2.has(groupKey.id)).toBeFalsy()
        expect(await store2.get(groupKey.id)).toBeFalsy()
        expect(await store2.size()).toBe(0)
        expect(await store2.delete(groupKey.id)).toBeFalsy()
        expect(await store2.clear()).toBeFalsy()
        expect(await store2.clear()).toBeFalsy()
        expect(await store.get(groupKey.id)).toEqual(groupKey)
    })

    it('can migrate old data', async () => {
        const clientId2 = `0x${crypto.randomBytes(20).toString('hex')}`
        const migrationsPath = await mkdtemp(join(tmpdir(), 'group-key-test-migrations'))
        // @ts-expect-error migrationsPath is only on ServerPersistentStore
        await copyFile(join(store.store.migrationsPath, '001-initial.sql'), join(migrationsPath, '001-initial.sql'))
        const store2 = new GroupKeyPersistence({
            clientId: clientId2,
            streamId,
            migrationsPath,
        })

        addAfter(() => store2.destroy())
        addAfter(() => rmdir(migrationsPath, { recursive: true }))

        const groupKey = GroupKey.generate()
        await store2.add(groupKey)
        expect(await store2.get(groupKey.id)).toEqual(groupKey)

        const store3 = new GroupKeyPersistence({
            clientId: clientId2,
            streamId,
        })
        expect(await store3.get(groupKey.id)).toEqual(groupKey)
    })

})
