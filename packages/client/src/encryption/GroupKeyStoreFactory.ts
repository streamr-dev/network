import { scoped, Lifecycle, inject } from 'tsyringe'

import { CacheAsyncFn, instanceId } from '../utils'
import { inspect } from '../utils/log'
import { Context, ContextError } from '../utils/Context'
import { ConfigInjectionToken, CacheConfig } from '../Config'
import { Ethereum } from '../Ethereum'

import { EncryptionConfig, parseGroupKeys } from './KeyExchangeStream'
import { GroupKeyStore } from './GroupKeyStore'
import { GroupKey } from './GroupKey'
import { StreamID } from 'streamr-client-protocol'

// In the client API we use the term EncryptionKey instead of GroupKey.
// The GroupKey name comes from the protocol. TODO: we could rename all classes
// and methods to use the term EncryptionKey (except protocol-classes, which
// should use the protocol level term GroupKey)
export interface UpdateEncryptionKeyOptions {
    streamId: string,
    distributionMethod: 'rotate' | 'rekey',
    key?: GroupKey
}

@scoped(Lifecycle.ContainerScoped)
export class GroupKeyStoreFactory implements Context {
    readonly id
    readonly debug
    private cleanupFns: ((...args: any[]) => any)[] = []
    initialGroupKeys
    getStore: ((streamId: StreamID) => Promise<GroupKeyStore>) & { clear(): void }
    constructor(
        context: Context,
        private ethereum: Ethereum,
        @inject(ConfigInjectionToken.Cache) cacheConfig: CacheConfig,
        @inject(ConfigInjectionToken.Encryption) encryptionConfig: EncryptionConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.getStore = CacheAsyncFn(this.getNewStore.bind(this), {
            ...cacheConfig,
            cacheKey([streamId]) {
                return streamId
            }
        })
        // TODO the streamIds in encryptionConfig.encryptionKeys should support path-format?
        this.initialGroupKeys = encryptionConfig.encryptionKeys
    }

    private async getNewStore(streamId: StreamID) {
        if (!streamId || typeof streamId !== 'string') {
            throw new ContextError(this, `invalid streamId for store: ${inspect(streamId)}`)
        }

        const clientId = await this.ethereum.getAddress()
        const store = new GroupKeyStore({
            context: this,
            clientId,
            streamId,
            groupKeys: [...parseGroupKeys(this.initialGroupKeys[streamId]).entries()]
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

    async useGroupKey(streamId: StreamID) {
        const store = await this.getStore(streamId)
        return store.useGroupKey()
    }

    async rotateGroupKey(streamId: StreamID) {
        const store = await this.getStore(streamId)
        return store.rotateGroupKey()
    }

    async setNextGroupKey(streamId: StreamID, newKey: GroupKey) {
        const store = await this.getStore(streamId)
        return store.setNextGroupKey(newKey)
    }

    async rekey(streamId: StreamID, newKey?: GroupKey) {
        const store = await this.getStore(streamId)
        return store.rekey(newKey)
    }

    async stop() {
        this.getStore.clear()
        const { cleanupFns } = this
        this.cleanupFns = []
        await Promise.allSettled(cleanupFns)
    }
}
