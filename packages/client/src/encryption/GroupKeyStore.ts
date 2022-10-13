import { scoped, Lifecycle, inject } from 'tsyringe'
import { join } from 'path'
import { instanceId } from '../utils/utils'
import { Context } from '../utils/Context'
import { GroupKey } from './GroupKey'
import { StreamID } from 'streamr-client-protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { StreamrClientEventEmitter } from '../events'
import { Persistence } from '../utils/persistence/Persistence'
import ServerPersistence from '../utils/persistence/ServerPersistence'
import { pOnce } from '../utils/promises'

// In the client API we use the term EncryptionKey instead of GroupKey.
// The GroupKey name comes from the protocol. TODO: we could rename all classes
// and methods to use the term EncryptionKey (except protocol-classes, which
// should use the protocol level term GroupKey)
export interface UpdateEncryptionKeyOptions {
    streamId: string
    distributionMethod: 'rotate' | 'rekey'
    key?: GroupKey
}

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyStore implements Context {
    readonly id
    readonly debug
    private persistence: Persistence<string, string> | undefined
    private ensureInitialized: () => Promise<void>

    constructor(
        context: Context,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(StreamrClientEventEmitter) private eventEmitter: StreamrClientEventEmitter
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.ensureInitialized = pOnce(async () => {
            const clientId = await this.authentication.getAddress()
            this.persistence = new ServerPersistence({
                context: this,
                tableName: 'GroupKeys',
                valueColumnName: 'groupKey',
                clientId,
                migrationsPath: join(__dirname, 'migrations')
            })
        })
    }

    async get(keyId: string, streamId: StreamID): Promise<GroupKey | undefined> {
        await this.ensureInitialized()
        const value = await this.persistence!.get(keyId, streamId)
        if (value === undefined) { return undefined }
        return new GroupKey(keyId, Buffer.from(value, 'hex'))
    }

    async add(key: GroupKey, streamId: StreamID): Promise<void> {
        await this.ensureInitialized()
        this.debug('Add key %s', key.id)
        await this.persistence!.set(key.id, Buffer.from(key.data).toString('hex'), streamId)
        this.eventEmitter.emit('addGroupKey', key)
    }

    async stop(): Promise<void> {
        await this.persistence?.close()
    }
}
