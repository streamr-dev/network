import 'reflect-metadata'

import { toStreamID } from '@streamr/utils'
import { mock, MockProxy } from 'jest-mock-extended'
import { Authentication } from '../../src/Authentication'
import { GroupKey } from '../../src/encryption/GroupKey'
import { GroupKeyManager } from '../../src/encryption/GroupKeyManager'
import { LocalGroupKeyStore } from '../../src/encryption/LocalGroupKeyStore'
import { GroupKeyQueue } from '../../src/publish/GroupKeyQueue'
import { createGroupKeyManager, createRandomAuthentication } from '../test-utils/utils'

const streamId = toStreamID('mock-stream')

describe('GroupKeyQueue', () => {
    let groupKeyStore: MockProxy<LocalGroupKeyStore>
    let authentication: Authentication
    let queue: GroupKeyQueue
    let groupKeyManager: GroupKeyManager

    beforeEach(async () => {
        groupKeyStore = mock<LocalGroupKeyStore>()
        authentication = createRandomAuthentication()
        groupKeyManager = createGroupKeyManager(groupKeyStore, authentication)
        queue = await GroupKeyQueue.createInstance(streamId, authentication, groupKeyManager)
    })

    it('can rotate and use', async () => {
        const groupKey = GroupKey.generate()
        await queue.rotate(groupKey)
        expect(groupKeyStore.set).toHaveBeenCalledTimes(1)
        expect(groupKeyStore.set).toHaveBeenCalledWith(groupKey.id, await authentication.getUserId(), groupKey.data)
        expect(await queue.useGroupKey()).toEqual({ current: groupKey })
        expect(await queue.useGroupKey()).toEqual({ current: groupKey })
        const groupKey2 = GroupKey.generate()
        await queue.rotate(groupKey2)
        expect(await queue.useGroupKey()).toEqual({ current: groupKey, next: groupKey2 })
        expect(await queue.useGroupKey()).toEqual({ current: groupKey2 })
    })

    it('generates a new key on first use', async () => {
        const { current, next } = await queue.useGroupKey()
        expect(current).toBeTruthy()
        expect(next).toBeUndefined()
    })

    it('only keeps the latest unused key', async () => {
        const groupKey = GroupKey.generate()
        const groupKey2 = GroupKey.generate()
        await queue.rotate(groupKey)
        await queue.rotate(groupKey2)
        expect(await queue.useGroupKey()).toEqual({ current: groupKey2, next: undefined })
    })

    it('replaces unused rotations', async () => {
        const { current, next } = await queue.useGroupKey()
        expect(current).toBeTruthy()
        expect(next).toEqual(undefined)

        const groupKey = await queue.rotate()
        expect(groupKey).toBeTruthy()
        const groupKey2 = await queue.rotate()
        expect(await queue.useGroupKey()).toEqual({ current: current, next: groupKey2 })
    })

    it('handles rotate then rekey', async () => {
        // Set some initial key
        const { current, next } = await queue.useGroupKey()
        expect(current).toBeTruthy()
        expect(next).toEqual(undefined)

        const rotatedKey = await queue.rotate()
        expect(rotatedKey).toBeTruthy()
        const rekey = await queue.rekey()
        expect(rekey).toBeTruthy()
        expect(await queue.useGroupKey()).toEqual({ current: rekey })
    })

    it('handles rekey then rotate', async () => {
        // Set some initial key
        const { current, next } = await queue.useGroupKey()
        expect(current).toBeTruthy()
        expect(next).toEqual(undefined)

        const rekey = await queue.rekey()
        expect(rekey).toBeTruthy()
        const rotatedKey = await queue.rotate()
        expect(rotatedKey).toBeTruthy()
        expect(await queue.useGroupKey()).toEqual({ current: rekey, next: rotatedKey })
    })
})
