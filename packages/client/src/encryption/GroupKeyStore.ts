/* eslint-disable padding-line-between-statements */
import { join } from 'path'
import { instanceId } from '../utils/utils'
import { Context } from '../utils/Context'
import { GroupKey } from './GroupKey'
import { Persistence } from '../utils/persistence/Persistence'
import ServerPersistence from '../utils/persistence/ServerPersistence'
import { StreamID } from 'streamr-client-protocol'
import { GroupKeyId } from './GroupKey'
import { StreamrClientEventEmitter } from '../events'

interface GroupKeyStoreOptions {
    context: Context
    clientId: string
    streamId: StreamID
    eventEmitter: StreamrClientEventEmitter
}

export class GroupKeyStore implements Context {
    readonly id
    readonly debug
    private persistence: Persistence<GroupKeyId, string>
    private currentGroupKey: GroupKey | undefined // current key id if any
    private queuedGroupKey: GroupKey | undefined // a group key queued to be rotated into use after the call to useGroupKey
    private eventEmitter: StreamrClientEventEmitter

    constructor({ context, clientId, streamId, eventEmitter }: GroupKeyStoreOptions) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.persistence = new ServerPersistence({
            context: this,
            tableName: 'GroupKeys',
            valueColumnName: 'groupKey',
            clientId,
            streamId,
            migrationsPath: join(__dirname, 'migrations')
        })
        this.eventEmitter = eventEmitter
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
        if (value === undefined) { return undefined }
        return new GroupKey(id, value)
    }

    async add(groupKey: GroupKey): Promise<GroupKey> {
        this.debug('Add key %s', groupKey.id)
        await this.persistence.set(groupKey.id, groupKey.hex)
        this.eventEmitter.emit('addGroupKey', groupKey)
        return groupKey
    }

    async rotate(newKey = GroupKey.generate()): Promise<GroupKey> {
        this.queuedGroupKey = newKey
        await this.add(newKey)
        return newKey
    }

    async close(): Promise<void> {
        return this.persistence.close()
    }

    async rekey(newKey = GroupKey.generate()): Promise<GroupKey> {
        await this.add(newKey)
        this.currentGroupKey = newKey
        this.queuedGroupKey = undefined
        return newKey
    }
}
