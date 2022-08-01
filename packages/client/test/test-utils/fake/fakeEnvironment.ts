import { fastPrivateKey } from 'streamr-test-utils'
import { container, DependencyContainer } from 'tsyringe'
import { BrubeckNode } from '../../../src/BrubeckNode'
import { ConfigInjectionToken, createStrictConfig, StreamrClientConfig, StrictStreamrClientConfig } from '../../../src/Config'
import { DestroySignal } from '../../../src/DestroySignal'
import { AuthConfig } from '../../../src/Authentication'
import { StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { StreamrClient } from '../../../src/StreamrClient'
import { initContainer } from '../../../src/Container'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { FakeBrubeckNode } from './FakeBrubeckNode'
import { ActiveNodes } from './ActiveNodes'
import { createEthereumAddressCache } from '../utils'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'
import { FakeHttpUtil } from './FakeHttpUtil'
import { HttpUtil } from '../../../src/HttpUtil'
import { EthereumAddress } from 'streamr-client-protocol'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'

export const DEFAULT_CLIENT_OPTIONS = {
    metrics: false
}

export interface ClientFactory {
    createClient: (opts?: StreamrClientConfig) => StreamrClient
}

export const createFakeContainer = (config: StreamrClientConfig | undefined): DependencyContainer => {
    const mockContainer = container.createChildContainer()
    if (config !== undefined) {
        initContainer(createStrictConfig(config), mockContainer)
    }
    mockContainer.registerSingleton(StreamRegistry, FakeStreamRegistry as any)
    mockContainer.registerSingleton(StreamStorageRegistry, FakeStreamStorageRegistry as any)
    mockContainer.registerSingleton(StorageNodeRegistry, FakeStorageNodeRegistry as any)
    mockContainer.registerSingleton(HttpUtil, FakeHttpUtil)
    mockContainer.registerSingleton(ActiveNodes, ActiveNodes as any)
    const ethereumAddressCache = createEthereumAddressCache()
    mockContainer.register(BrubeckNode, { useFactory: (c: DependencyContainer) => {
        /*
         * We need to use a DI factory to register the BrubeckNode, because config-related
         * injection tokens for the DI are only available after we have created a StreamrClient
         * instance (it calls initContainer() in StreamrClient.ts to create the injection tokens).
         *
         * The ActiveNodes singleton is used to keep track of all nodes created in this
         * fake environment. The BrubeckNode which we create here belongs a StreamrClient,
         * and we identify it by a Ethereum address (calculated from client.auth.privateKey).
         * The calculation of the Ethereum address is relatively slow: therefore we use
         * the ethereumAddressCache to speed-up the privateKey->address mapping.
         */
        const { privateKey } = c.resolve(ConfigInjectionToken.Auth) as AuthConfig
        const activeNodes = c.resolve(ActiveNodes)
        const address = ethereumAddressCache.getAddress(privateKey ?? fastPrivateKey())
        let node = activeNodes.getNode(address)
        if (node === undefined) {
            const { id } = c.resolve(ConfigInjectionToken.Root) as StrictStreamrClientConfig
            const destroySignal = c.resolve(DestroySignal)
            node = new FakeBrubeckNode(address!, activeNodes, destroySignal, id)
            activeNodes.addNode(node)
        }
        return node as any
    } })
    return mockContainer
}

export const createClientFactory = (): ClientFactory => {
    const mockContainer = createFakeContainer(undefined) // config is initialized in StreamrClient constructor (no need to call initContainer here)
    return {
        createClient: (opts?: StreamrClientConfig) => {
            let authOpts
            if (opts?.auth?.privateKey === undefined) {
                authOpts = {
                    auth: {
                        privateKey: fastPrivateKey()
                    }
                }
            }
            const config = {
                ...DEFAULT_CLIENT_OPTIONS,
                ...authOpts,
                ...opts
            }
            return new StreamrClient(config, mockContainer)
        }
    }
}

export const addFakeNode = (
    nodeId: EthereumAddress,
    mockContainer: DependencyContainer
): FakeBrubeckNode => {
    const activeNodes = mockContainer.resolve(ActiveNodes)
    const destroySignal = mockContainer.resolve(DestroySignal)
    const node = new FakeBrubeckNode(nodeId, activeNodes, destroySignal)
    activeNodes.addNode(node)
    return node
}
