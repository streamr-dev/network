import { fastPrivateKey } from 'streamr-test-utils'
import { container, DependencyContainer } from 'tsyringe'
import BrubeckNode from '../../../src/BrubeckNode'
import { Config, StrictStreamrClientConfig } from '../../../src/Config'
import { DestroySignal } from '../../../src/DestroySignal'
import { AuthConfig } from '../../../src/Ethereum'
import { Rest } from '../../../src/Rest'
import { StorageNodeRegistry } from '../../../src/StorageNodeRegistry'
import { StreamrClient } from '../../../src/StreamrClient'
import { StreamRegistry } from '../../../src/StreamRegistry'
import { FakeBrubeckNode } from './FakeBrubeckNode'
import { ActiveNodes } from './ActiveNodes'
import { FakeRest } from './FakeRest'
import { createEthereumAddressCache } from '../utils'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'

export interface ClientFactory {
    createClient: (opts: any) => StreamrClient
}

export const createClientFactory = () => {
    const mockContainer = container.createChildContainer()
    mockContainer.registerSingleton(StreamRegistry, FakeStreamRegistry as any)
    mockContainer.registerSingleton(StorageNodeRegistry, FakeStorageNodeRegistry as any)
    mockContainer.registerSingleton(ActiveNodes, ActiveNodes as any)
    mockContainer.registerSingleton(Rest, FakeRest as any)
    const ethereumAddressCache = createEthereumAddressCache()
    mockContainer.register(BrubeckNode, { useFactory: (c: DependencyContainer) => {
        const { privateKey } = c.resolve(Config.Auth) as AuthConfig
        const registry = c.resolve(ActiveNodes)
        const address = ethereumAddressCache.getAddress(privateKey!)
        let node = registry.getNode(address)
        if (node === undefined) {
            const { id } = c.resolve(Config.Root) as StrictStreamrClientConfig
            const destroySignal = c.resolve(DestroySignal)
            node = new FakeBrubeckNode(address!, registry, destroySignal, id)
            registry.addNode(node)
        }
        return node as any
    } })

    return {
        createClient: (opts: any) => {
            let authOpts
            if (opts?.auth?.privateKey === undefined) {
                authOpts = {
                    auth: {
                        privateKey: fastPrivateKey()
                    }
                }
            }
            const config = {
                ...opts,
                ...authOpts
            }
            return new StreamrClient(config, mockContainer)
        }
    }
}
