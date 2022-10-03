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

    async get(id: GroupKeyId): Promise<GroupKey | undefined> {
        const value = await this.persistence.get(id)
        if (value === undefined) { return undefined }
        return new GroupKey(id, value)
    }

    async add(groupKey: GroupKey): Promise<void> {
        this.debug('Add key %s', groupKey.id)
        await this.persistence.set(groupKey.id, groupKey.hex)
        this.eventEmitter.emit('addGroupKey', groupKey)
    }

    async close(): Promise<void> {
        return this.persistence.close()
    }
}
