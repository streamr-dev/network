import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyStore } from '../../src/encryption/GroupKeyStore'
import { GroupKeyQueue } from '../../src/publish/GroupKeyQueue'

describe('GroupKeyQueue', () => {

    let queue: GroupKeyQueue
    const addToStore = jest.fn().mockResolvedValue(undefined)

    beforeEach(() => {
        const store: Partial<GroupKeyStore> = {
            add: addToStore
        }
        queue = new GroupKeyQueue(store as any)
    })

    it('can rotate and use', async () => {
        const groupKey = GroupKey.generate()
        await queue.rotate(groupKey)
        expect(addToStore).toBeCalledTimes(1)
        expect(addToStore).toBeCalledWith(groupKey)
        expect(await queue.useGroupKey()).toEqual([groupKey, undefined])
        expect(await queue.useGroupKey()).toEqual([groupKey, undefined])
        const groupKey2 = GroupKey.generate()
        await queue.rotate(groupKey2)
        expect(await queue.useGroupKey()).toEqual([groupKey, groupKey2])
        expect(await queue.useGroupKey()).toEqual([groupKey2, undefined])
    })

    it('generates a new key on first use', async () => {
        const [generatedKey, nextKey] = await queue.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(nextKey).toBeUndefined()
    })

    it('only keeps the latest unused key', async () => {
        const groupKey = GroupKey.generate()
        const groupKey2 = GroupKey.generate()
        await queue.rotate(groupKey)
        await queue.rotate(groupKey2)
        expect(await queue.useGroupKey()).toEqual([groupKey2, undefined])
    })

    it('replaces unused rotations', async () => {
        const [generatedKey, queuedKey] = await queue.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(queuedKey).toEqual(undefined)

        const groupKey = await queue.rotate()
        expect(groupKey).toBeTruthy()
        const groupKey2 = await queue.rotate()
        expect(await queue.useGroupKey()).toEqual([generatedKey, groupKey2])
    })

    it('handles rotate then rekey', async () => {
        // Set some initial key
        const [generatedKey, queuedKey] = await queue.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(queuedKey).toEqual(undefined)

        const rotatedKey = await queue.rotate()
        expect(rotatedKey).toBeTruthy()
        const rekey = await queue.rekey()
        expect(rekey).toBeTruthy()
        expect(await queue.useGroupKey()).toEqual([rekey, undefined])
    })

    it('handles rekey then rotate', async () => {
        // Set some initial key
        const [generatedKey, queuedKey] = await queue.useGroupKey()
        expect(generatedKey).toBeTruthy()
        expect(queuedKey).toEqual(undefined)

        const rekey = await queue.rekey()
        expect(rekey).toBeTruthy()
        const rotatedKey = await queue.rotate()
        expect(rotatedKey).toBeTruthy()
        expect(await queue.useGroupKey()).toEqual([rekey, rotatedKey])
    })

})
