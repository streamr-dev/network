import { container, DependencyContainer } from 'tsyringe'
import { merge } from 'lodash'
import { fastPrivateKey } from 'streamr-test-utils'
import { createStrictConfig, StreamrClientConfig } from '../../../src/Config'
import { StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { StreamrClient } from '../../../src/StreamrClient'
import { initContainer } from '../../../src/Container'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'
import { FakeHttpUtil } from './FakeHttpUtil'
import { HttpUtil } from '../../../src/HttpUtil'
import { EthereumAddress } from 'streamr-client-protocol'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'
import { FakeNetworkNodeFactory, FakeNetworkNode } from './FakeNetworkNode'
import { NetworkNodeFactory } from './../../../src/BrubeckNode'

export const DEFAULT_CLIENT_OPTIONS: StreamrClientConfig = {
    network: {
        trackers: [] // without this setting BrubeckNode would query the tracker addresses from the contract
    },
    metrics: false
}

export interface ClientFactory {
    createClient: (opts?: StreamrClientConfig) => StreamrClient
}

export const createFakeContainer = (config: StreamrClientConfig | undefined): DependencyContainer => {
    const mockContainer = container.createChildContainer()
    if (config !== undefined) {
        const configWithDefaults = merge({}, DEFAULT_CLIENT_OPTIONS, config)
        initContainer(createStrictConfig(configWithDefaults), mockContainer)
    }
    mockContainer.registerSingleton(NetworkNodeFactory, FakeNetworkNodeFactory)
    mockContainer.registerSingleton(StreamRegistry, FakeStreamRegistry as any)
    mockContainer.registerSingleton(StreamStorageRegistry, FakeStreamStorageRegistry as any)
    mockContainer.registerSingleton(StorageNodeRegistry, FakeStorageNodeRegistry as any)
    mockContainer.registerSingleton(HttpUtil, FakeHttpUtil)
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
            const configWithDefaults = merge({}, DEFAULT_CLIENT_OPTIONS, authOpts, opts)
            return new StreamrClient(configWithDefaults, mockContainer)
        }
    }
}

export const addFakeNode = (
    nodeId: EthereumAddress,
    mockContainer: DependencyContainer
): FakeNetworkNode => {
    const factory = mockContainer.resolve(NetworkNodeFactory)
    const node = factory.createNetworkNode({
        id: nodeId
    } as any) as FakeNetworkNode
    node.start()
    return node
}
