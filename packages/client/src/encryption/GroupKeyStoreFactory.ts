import { scoped, Lifecycle, inject } from 'tsyringe'
import { instanceId } from '../utils/utils'
import { CacheAsyncFn } from '../utils/caches'
import { inspect } from '../utils/log'
import { Context, ContextError } from '../utils/Context'
import { ConfigInjectionToken, CacheConfig, EncryptionConfig } from '../Config'
import { GroupKeyId, GroupKeyish } from './GroupKey'
import { GroupKeyStore } from './GroupKeyStore'
import { GroupKey } from './GroupKey'
import { StreamID } from 'streamr-client-protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { StreamrClientEventEmitter } from '../events'

export type GroupKeysSerialized = Record<GroupKeyId, GroupKeyish>

// In the client API we use the term EncryptionKey instead of GroupKey.
// The GroupKey name comes from the protocol. TODO: we could rename all classes
// and methods to use the term EncryptionKey (except protocol-classes, which
// should use the protocol level term GroupKey)
export interface UpdateEncryptionKeyOptions {
    streamId: string
    distributionMethod: 'rotate' | 'rekey'
    key?: GroupKey
}

function parseGroupKeys(groupKeys: GroupKeysSerialized = {}): Map<GroupKeyId, GroupKey> {
    return new Map<GroupKeyId, GroupKey>(Object.entries(groupKeys || {}).map(([key, value]) => {
        if (!value || !key) { return null }
        return [key, GroupKey.from(value)]
    }).filter(Boolean) as [])
}

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyStoreFactory implements Context {
    readonly id
    readonly debug
    private cleanupFns: ((...args: any[]) => any)[] = []
    private initialGroupKeys: Record<string, GroupKeysSerialized>
    public getStore: ((streamId: StreamID) => Promise<GroupKeyStore>)

    constructor(
        context: Context,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Cache) cacheConfig: CacheConfig,
        @inject(ConfigInjectionToken.Encryption) encryptionConfig: EncryptionConfig,
        @inject(StreamrClientEventEmitter) private eventEmitter: StreamrClientEventEmitter
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.getStore = CacheAsyncFn(this.getNewStore.bind(this), {
            ...cacheConfig,
            cacheKey([streamId]): StreamID {
                return streamId
            }
        })
        // TODO the streamIds in encryptionConfig.encryptionKeys should support path-format?
        this.initialGroupKeys = encryptionConfig.encryptionKeys
    }

    private async getNewStore(streamId: StreamID): Promise<GroupKeyStore> {
        if (!streamId || typeof streamId !== 'string') {
            throw new ContextError(this, `invalid streamId for store: ${inspect(streamId)}`)
        }

        const clientId = await this.authentication.getAddress()
        const initialKeys = [...parseGroupKeys(this.initialGroupKeys[streamId]).entries()]
        const store = new GroupKeyStore({
            context: this,
            clientId,
            streamId,
            groupKeys: initialKeys,
            eventEmitter: this.eventEmitter
        })
        if (initialKeys.length > 0) {
            // TODO this hack stores the initial keys (could improve this in NET-878)
            // @ts-expect-error private
            await store.persistence.init()
        }
        this.cleanupFns.push(async () => {
            try {
                await store.close()
            } catch (_err) {
                // whatever

            }
        })
        return store
    }

    async stop(): Promise<void> {
        const { cleanupFns } = this
        this.cleanupFns = []
        await Promise.allSettled(cleanupFns)
    }
}
