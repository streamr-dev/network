import { scoped, Lifecycle, inject } from 'tsyringe'
import { instanceId } from '../utils/utils'
import { CacheAsyncFn } from '../utils/caches'
import { inspect } from '../utils/log'
import { Context, ContextError } from '../utils/Context'
import { ConfigInjectionToken, CacheConfig } from '../Config'
import { GroupKeyStore } from './GroupKeyStore'
import { GroupKey } from './GroupKey'
import { StreamID } from 'streamr-client-protocol'
import { Authentication, AuthenticationInjectionToken } from '../Authentication'
import { StreamrClientEventEmitter } from '../events'

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
export class GroupKeyStoreFactory implements Context {
    readonly id
    readonly debug
    private cleanupFns: (() => void)[] = []
    public getStore: ((streamId: StreamID) => Promise<GroupKeyStore>)

    constructor(
        context: Context,
        @inject(AuthenticationInjectionToken) private authentication: Authentication,
        @inject(ConfigInjectionToken.Cache) cacheConfig: CacheConfig,
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
    }

    private async getNewStore(streamId: StreamID): Promise<GroupKeyStore> {
        if (!streamId || typeof streamId !== 'string') {
            throw new ContextError(this, `invalid streamId for store: ${inspect(streamId)}`)
        }

        const clientId = await this.authentication.getAddress()
        const store = new GroupKeyStore({
            context: this,
            clientId,
            streamId,
            eventEmitter: this.eventEmitter
        })
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
