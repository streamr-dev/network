import { instanceId } from '../utils'
import { Context } from '../utils/Context'
import { GroupKey } from './GroupKey'
import { PersistentStore } from './PersistentStore'

import ServerPersistentStore, { ServerPersistentStoreOptions } from './ServerPersistentStore'
import { StreamID } from 'streamr-client-protocol'

type GroupKeyId = string

type GroupKeyStoreOptions = {
    context: Context,
    clientId: string,
    streamId: StreamID,
    groupKeys: [GroupKeyId, GroupKey][]
}

export class GroupKeyPersistence implements PersistentStore<string, GroupKey> {
    store: PersistentStore<string, string>
    constructor(options: ServerPersistentStoreOptions) {
        this.store = new ServerPersistentStore(options)
    }

    async has(groupKeyId: string): Promise<boolean> {
        return this.store.has(groupKeyId)
    }

    async size(): Promise<number> {
        return this.store.size()
    }

    async get(groupKeyId: string): Promise<GroupKey | undefined> {
        const value = await this.store.get(groupKeyId)
        if (!value) { return undefined }
        return GroupKey.from([groupKeyId, value])
    }

    async add(groupKey: GroupKey): Promise<boolean> {
        return this.set(groupKey.id, groupKey)
    }

    async set(groupKeyId: string, value: GroupKey): Promise<boolean> {
        GroupKey.validate(value)
        return this.store.set(groupKeyId, value.hex)
    }

    async delete(groupKeyId: string): Promise<boolean> {
        return this.store.delete(groupKeyId)
    }

    async clear(): Promise<boolean> {
        return this.store.clear()
    }

    async destroy(): Promise<void> {
        return this.store.destroy()
    }

    async close(): Promise<void> {
        return this.store.close()
    }

    async exists(): Promise<boolean> {
        return this.store.exists()
    }

    get [Symbol.toStringTag](): string {
        return this.constructor.name
    }
}

export class GroupKeyStore implements Context {
    readonly id
    readonly debug
    store
    currentGroupKeyId: GroupKeyId | undefined // current key id if any
    nextGroupKeys: GroupKey[] = [] // the keys to use next, disappears if not actually used. Max queue size 2

    constructor({ context, clientId, streamId, groupKeys }: GroupKeyStoreOptions) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        const initialData = groupKeys.reduce((o, [, groupKey]) => Object.assign(o, {
            [groupKey.id]: groupKey.hex,
        }), {})
        this.store = new GroupKeyPersistence({ context: this, clientId, streamId, initialData })

        groupKeys.forEach(([groupKeyId, groupKey]) => {
            GroupKey.validate(groupKey)
            if (groupKeyId !== groupKey.id) {
                throw new Error(`Ids must match: groupKey.id: ${groupKey.id}, groupKeyId: ${groupKeyId}`)
            }
            // use last init key as current
            this.currentGroupKeyId = groupKey.id
        })
    }

    private async storeKey(groupKey: GroupKey): Promise<GroupKey> {
        GroupKey.validate(groupKey)
        const existingKey = await this.store.get(groupKey.id)
        if (existingKey) {
            if (!existingKey.equals(groupKey)) {
                throw new GroupKey.InvalidGroupKeyError(
                    `Trying to add groupKey ${groupKey.id} but key exists & is not equivalent to new GroupKey: ${groupKey}.`,
                    groupKey
                )
            }

            await this.store.set(groupKey.id, existingKey)
            return existingKey
        }

        await this.store.set(groupKey.id, groupKey)
        return groupKey
    }

    async has(id: GroupKeyId): Promise<boolean> {
        if (this.currentGroupKeyId === id) { return true }

        if (this.nextGroupKeys.some((nextKey) => nextKey.id === id)) { return true }

        return this.store.has(id)
    }

    async isEmpty(): Promise<boolean> {
        // any pending keys means it's not empty
        if (this.nextGroupKeys.length) { return false }

        return (await this.store.size()) === 0
    }

    async useGroupKey(): Promise<[GroupKey | undefined, GroupKey | undefined]> {
        const nextGroupKey = this.nextGroupKeys.pop()
        // First use of group key on this stream, no current key. Make next key current.
        if (!this.currentGroupKeyId && nextGroupKey) {
            this.currentGroupKeyId = nextGroupKey.id
            return [
                await this.get(this.currentGroupKeyId!),
                undefined,
            ]
        }

        // Keep using current key (empty next)
        if (this.currentGroupKeyId != null && !nextGroupKey) {
            return [
                await this.get(this.currentGroupKeyId),
                undefined
            ]
        }

        // Key changed (non-empty next). return current + next. Make next key current.
        if (this.currentGroupKeyId != null && nextGroupKey != null) {
            const prevId = this.currentGroupKeyId
            this.currentGroupKeyId = nextGroupKey.id
            const prevGroupKey = await this.get(prevId)
            // use current key one more time
            return [
                prevGroupKey,
                nextGroupKey,
            ]
        }

        // Generate & use new key if none already set.
        await this.rotateGroupKey()
        return this.useGroupKey()
    }

    async get(id: GroupKeyId): Promise<GroupKey | undefined> {
        return this.store.get(id)
    }

    async exists(): Promise<boolean> {
        return this.store.exists()
    }

    async clear(): Promise<boolean> {
        this.currentGroupKeyId = undefined
        this.nextGroupKeys.length = 0

        return this.store.clear()
    }

    async rotateGroupKey(): Promise<void> {
        return this.setNextGroupKey(GroupKey.generate())
    }

    async add(groupKey: GroupKey): Promise<GroupKey> {
        return this.storeKey(groupKey)
    }

    async setNextGroupKey(newKey: GroupKey): Promise<void> {
        GroupKey.validate(newKey)
        this.nextGroupKeys.unshift(newKey)
        this.nextGroupKeys.length = Math.min(this.nextGroupKeys.length, 2)
        await this.storeKey(newKey)
    }

    async close(): Promise<void> {
        return this.store.close()
    }

    async rekey(newKey = GroupKey.generate()): Promise<void> {
        await this.storeKey(newKey)
        this.currentGroupKeyId = newKey.id
        this.nextGroupKeys.length = 0
    }
}
