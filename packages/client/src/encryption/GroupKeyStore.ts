import { scoped, Lifecycle, inject } from 'tsyringe'
import { join } from 'path'
import { GroupKey, GroupKeyId } from './GroupKey'
import { StreamID } from '@streamr/protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { StreamrClientEventEmitter } from '../events'
import { Persistence } from '../utils/persistence/Persistence'
import ServerPersistence from '../utils/persistence/ServerPersistence'
import { pOnce } from '../utils/promises'
import { LoggerFactory } from '../utils/LoggerFactory'
import { Logger } from '@streamr/utils'

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
export class GroupKeyStore {
    private readonly logger: Logger
    private readonly ensureInitialized: () => Promise<void>
    private persistence: Persistence<GroupKeyId, string> | undefined

    constructor(
        @inject(LoggerFactory) loggerFactory: LoggerFactory,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(StreamrClientEventEmitter) private eventEmitter: StreamrClientEventEmitter
    ) {
        this.logger = loggerFactory.createLogger(module)
        this.ensureInitialized = pOnce(async () => {
            const clientId = await this.authentication.getAddress()
            this.persistence = new ServerPersistence({
                loggerFactory,
                tableName: 'GroupKeys',
                valueColumnName: 'groupKey',
                clientId,
                migrationsPath: join(__dirname, 'migrations')
            })
        })
    }

    async get(keyId: GroupKeyId, streamId: StreamID): Promise<GroupKey | undefined> {
        await this.ensureInitialized()
        const value = await this.persistence!.get(keyId, streamId)
        if (value === undefined) { return undefined }
        return new GroupKey(keyId, Buffer.from(value, 'hex'))
    }

    async add(key: GroupKey, streamId: StreamID): Promise<void> {
        await this.ensureInitialized()
        this.logger.debug('add key %s', key.id)
        await this.persistence!.set(key.id, Buffer.from(key.data).toString('hex'), streamId)
        this.eventEmitter.emit('addGroupKey', key)
    }

    async stop(): Promise<void> {
        await this.persistence?.close()
    }
}
