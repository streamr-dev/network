import { scoped, Lifecycle, inject } from 'tsyringe'

import { CacheAsyncFn, instanceId } from '../utils'
import { inspect } from '../utils/log'
import type { Context } from '../utils/Context'
import { ContextError } from '../utils/Context'
import type { CacheConfig } from '../Config'
import { Config } from '../Config'
import type Ethereum from '../Ethereum'

import type { EncryptionConfig } from './KeyExchangeUtils'
import { parseGroupKeys } from './KeyExchangeUtils'
import GroupKeyStore from './GroupKeyStore'
import type { GroupKey } from './Encryption'

@scoped(Lifecycle.ContainerScoped)
export default class GroupKeyStoreFactory implements Context {
    id
    debug
    private cleanupFns: ((...args: any[]) => any)[] = []
    initialGroupKeys
    getStore: ((streamId: string) => Promise<GroupKeyStore>) & { clear(): void }
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
                return streamId // TODO: spid.key?
            }
        })
        this.initialGroupKeys = encryptionConfig.groupKeys
    }

    private async getNewStore(streamId: string) {
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

    async useGroupKey(streamId: string) {
        const store = await this.getStore(streamId)
        return store.useGroupKey()
    }

    async rotateGroupKey(streamId: string) {
        const store = await this.getStore(streamId)
        return store.rotateGroupKey()
    }

    async setNextGroupKey(streamId: string, newKey: GroupKey) {
        const store = await this.getStore(streamId)
        return store.setNextGroupKey(newKey)
    }

    async rekey(streamId: string) {
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
