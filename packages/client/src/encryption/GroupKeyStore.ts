import { scoped, Lifecycle, inject } from 'tsyringe'
import { join } from 'path'
import { instanceId } from '../utils/utils'
import { CacheAsyncFn } from '../utils/caches'
import { Context } from '../utils/Context'
import { ConfigInjectionToken, CacheConfig } from '../Config'
import { GroupKey, GroupKeyId } from './GroupKey'
import { StreamID } from 'streamr-client-protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { StreamrClientEventEmitter } from '../events'
import { Persistence } from '../utils/persistence/Persistence'
import ServerPersistence from '../utils/persistence/ServerPersistence'

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
    private cleanupFns: (() => void)[] = []
    public getPersistence: ((streamId: StreamID) => Promise<Persistence<GroupKeyId, string>>)

    constructor(
        context: Context,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Cache) cacheConfig: CacheConfig,
        @inject(StreamrClientEventEmitter) private eventEmitter: StreamrClientEventEmitter
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.getPersistence = CacheAsyncFn(this.createPersistence.bind(this), {
            ...cacheConfig,
            cacheKey([streamId]): StreamID {
                return streamId
            }
        })
    }

    private async createPersistence(streamId: StreamID): Promise<Persistence<GroupKeyId, string>> {
        const clientId = await this.authentication.getAddress()
        const persistence = new ServerPersistence({
            context: this,
            tableName: 'GroupKeys',
            valueColumnName: 'groupKey',
            clientId,
            streamId,
            migrationsPath: join(__dirname, 'migrations')
        })
        this.cleanupFns.push(async () => {
            try {
                await persistence.close()
            } catch (_err) {
                // whatever
            }
        })
        return persistence
    }

    async get(keyId: GroupKeyId, streamId: StreamID): Promise<GroupKey | undefined> {
        const persistence = await this.getPersistence(streamId)
        const value = await persistence.get(keyId)
        if (value === undefined) { return undefined }
        return new GroupKey(keyId, value)
    }

    async add(key: GroupKey, streamId: StreamID): Promise<void> {
        const persistence = await this.getPersistence(streamId)
        this.debug('Add key %s', key.id)
        await persistence.set(key.id, key.hex)
        this.eventEmitter.emit('addGroupKey', key)
    }

    async stop(): Promise<void> {
        const { cleanupFns } = this
        this.cleanupFns = []
        await Promise.allSettled(cleanupFns)
    }
}
