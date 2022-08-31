import { join } from 'path'
import { instanceId } from '../utils/utils'
import { Context } from '../utils/Context'
import { GroupKey } from './GroupKey'
import { Persistence } from '../utils/persistence/Persistence'

import ServerPersistence from '../utils/persistence/ServerPersistence'
import { StreamID } from 'streamr-client-protocol'

type GroupKeyId = string

interface GroupKeyStoreOptions {
    context: Context
    clientId: string
    streamId: StreamID
    groupKeys: [GroupKeyId, GroupKey][]
}

export class GroupKeyStore implements Context {
    readonly id
    readonly debug
    private persistence: Persistence<string, string>
    private currentGroupKey: GroupKey | undefined // current key id if any
    private queuedGroupKey: GroupKey | undefined // a group key queued to be rotated into use after the call to useGroupKey

    constructor({ context, clientId, streamId, groupKeys }: GroupKeyStoreOptions) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        const initialData = groupKeys.reduce((o, [, groupKey]) => Object.assign(o, {
            [groupKey.id]: groupKey.hex,
        }), {})
        this.persistence = new ServerPersistence({
            context: this,
            tableName: 'GroupKeys',
            valueColumnName: 'groupKey',
            clientId,
            streamId,
            initialData,
            migrationsPath: join(__dirname, 'migrations')
        })

        groupKeys.forEach(([groupKeyId, groupKey]) => {
            if (groupKeyId !== groupKey.id) {
                throw new Error(`Ids must match: groupKey.id: ${groupKey.id}, groupKeyId: ${groupKeyId}`)
            }
            // use last init key as current
            this.currentGroupKey = groupKey
        })
    }

    private async storeKey(groupKey: GroupKey): Promise<GroupKey> {
        const existingKey = await this.get(groupKey.id)
        if (existingKey) {
            if (!existingKey.equals(groupKey)) {
                throw new GroupKey.InvalidGroupKeyError(
                    `Trying to add groupKey ${groupKey.id} but key exists & is not equivalent to new GroupKey: ${groupKey}.`,
                    groupKey
                )
            }

            await this.persistence.set(groupKey.id, existingKey.hex)
            return existingKey
        }

        await this.persistence.set(groupKey.id, groupKey.hex)
        return groupKey
    }

    async has(id: GroupKeyId): Promise<boolean> {
        if (this.currentGroupKey?.id === id) { return true }

        if (this.queuedGroupKey?.id === id) { return true }

        return this.persistence.has(id)
    }

    async isEmpty(): Promise<boolean> {
        // a queued key means it's not empty
        if (this.queuedGroupKey) { return false }

        return (await this.persistence.size()) === 0
    }

    async useGroupKey(): Promise<[GroupKey, GroupKey | undefined]> {
        // Ensure we have a current key by picking a queued key or generating a new one
        if (!this.currentGroupKey) {
            this.currentGroupKey = this.queuedGroupKey || await this.rekey()
            this.queuedGroupKey = undefined
        }

        // Always return an array consisting of currentGroupKey and queuedGroupKey (latter may be undefined)
        const result: [GroupKey, GroupKey | undefined] = [
            this.currentGroupKey!,
            this.queuedGroupKey,
        ]

        // Perform the rotate if there's a next key queued
        if (this.queuedGroupKey) {
            this.currentGroupKey = this.queuedGroupKey
            this.queuedGroupKey = undefined
        }

        return result
    }

    async get(id: GroupKeyId): Promise<GroupKey | undefined> {
        const value = await this.persistence.get(id)
        if (!value) { return undefined }
        return GroupKey.from([id, value])
    }

    async exists(): Promise<boolean> {
        return this.persistence.exists()
    }

    async clear(): Promise<boolean> {
        this.currentGroupKey = undefined
        this.queuedGroupKey = undefined

        return this.persistence.clear()
    }

    async rotateGroupKey(): Promise<GroupKey> {
        return this.setNextGroupKey(GroupKey.generate())
    }

    async add(groupKey: GroupKey): Promise<GroupKey> {
        return this.storeKey(groupKey)
    }

    async setNextGroupKey(newKey: GroupKey): Promise<GroupKey> {
        this.queuedGroupKey = newKey
        await this.storeKey(newKey)
        return newKey
    }

    async close(): Promise<void> {
        return this.persistence.close()
    }

    async rekey(newKey = GroupKey.generate()): Promise<GroupKey> {
        await this.storeKey(newKey)
        this.currentGroupKey = newKey
        this.queuedGroupKey = undefined
        return newKey
    }

    async size(): Promise<number> {
        return this.persistence.size()
    }
}
