import { scoped, Lifecycle, inject } from 'tsyringe'

import { CacheAsyncFn, instanceId } from '../utils'
import { inspect } from '../utils/log'
import { Context, ContextError } from '../utils/Context'
import { Config, CacheConfig } from '../Config'
import Ethereum from '../Ethereum'

import { EncryptionConfig, parseGroupKeys } from './KeyExchangeUtils'
import GroupKeyStore from './GroupKeyStore'
import { GroupKey } from './Encryption'
import { StreamID } from 'streamr-client-protocol'

@scoped(Lifecycle.ContainerScoped)
export default class GroupKeyStoreFactory implements Context {
    /** @internal */
    readonly id
    /** @internal */
    readonly debug
    private cleanupFns: ((...args: any[]) => any)[] = []
    initialGroupKeys
    /** @internal */
    getStore: ((streamId: StreamID) => Promise<GroupKeyStore>) & { clear(): void }
    constructor(
        context: Context,
        private ethereum: Ethereum,
        @inject(Config.Cache) cacheConfig: CacheConfig,
        @inject(Config.Encryption) encryptionConfig: EncryptionConfig
    ) {
        this.id = instanceId(this)
        this.debug = context.debug.extend(this.id)
        this.getStore = CacheAsyncFn(this.getNewStore.bind(this), {
            ...cacheConfig,
            cacheKey([streamId]) {
                return streamId
            }
        })
        this.initialGroupKeys = encryptionConfig.groupKeys
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

    /** @internal */
    async useGroupKey(streamId: StreamID) {
        const store = await this.getStore(streamId)
        return store.useGroupKey()
    }

    /** @internal */
    async rotateGroupKey(streamId: StreamID) {
        const store = await this.getStore(streamId)
        return store.rotateGroupKey()
    }

    /** @internal */
    async setNextGroupKey(streamId: StreamID, newKey: GroupKey) {
        const store = await this.getStore(streamId)
        return store.setNextGroupKey(newKey)
    }

    /** @internal */
    async rekey(streamId: StreamID) {
        const store = await this.getStore(streamId)
        return store.rekey()
    }

    async stop() {
        this.getStore.clear()
        const { cleanupFns } = this
        this.cleanupFns = []
        await Promise.allSettled(cleanupFns)
    }
}
