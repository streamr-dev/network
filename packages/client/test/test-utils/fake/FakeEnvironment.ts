import { container, DependencyContainer } from 'tsyringe'
import { merge } from 'lodash'
import { fastPrivateKey, fastWallet } from 'streamr-test-utils'
import { StreamrClientConfig } from '../../../src/Config'
import { StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { StreamrClient } from '../../../src/StreamrClient'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'
import { FakeHttpUtil } from './FakeHttpUtil'
import { HttpUtil } from '../../../src/HttpUtil'
import { EthereumAddress } from 'streamr-client-protocol'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'
import { FakeNetworkNodeFactory, FakeNetworkNode } from './FakeNetworkNode'
import { NetworkNodeFactory } from '../../../src/NetworkNodeFacade'
import { FakeNetwork } from './FakeNetwork'
import { FakeChain } from './FakeChain'
import { FakeStorageNode } from './FakeStorageNode'

const DEFAULT_CLIENT_OPTIONS: StreamrClientConfig = {
    network: {
        trackers: [] // without this setting NetworkNodeFacade would query the tracker addresses from the contract
    },
    metrics: false
}

export class FakeEnvironment {
    private network: FakeNetwork
    private chain: FakeChain
    private dependencyContainer: DependencyContainer

    constructor() {
        this.network = new FakeNetwork()
        this.chain = new FakeChain()
        this.dependencyContainer = container.createChildContainer()
        const httpUtil = new FakeHttpUtil(this.network)
        this.dependencyContainer.register(FakeNetwork, { useValue: this.network })
        this.dependencyContainer.register(FakeChain, { useValue: this.chain })
        this.dependencyContainer.register(HttpUtil, { useValue: httpUtil })
        this.dependencyContainer.register(NetworkNodeFactory, FakeNetworkNodeFactory)
        this.dependencyContainer.register(StreamRegistry, FakeStreamRegistry as any)
        this.dependencyContainer.register(StreamStorageRegistry, FakeStreamStorageRegistry as any)
        this.dependencyContainer.register(StorageNodeRegistry, FakeStorageNodeRegistry as any)
    }
    
    createClient(opts?: StreamrClientConfig): StreamrClient {
        let authOpts
        if (opts?.auth === undefined) {
            authOpts = {
                auth: {
                    privateKey: fastPrivateKey()
                }
            }
        }
        const configWithDefaults = merge({}, DEFAULT_CLIENT_OPTIONS, authOpts, opts)
        return new StreamrClient(configWithDefaults, this.dependencyContainer)
    }

    startNode(nodeId: EthereumAddress): FakeNetworkNode {
        const node = new FakeNetworkNode({
            id: nodeId
        } as any, this.network)
        node.start()
        return node
    }

    startStorageNode(): FakeStorageNode {
        const wallet = fastWallet()
        const node = new FakeStorageNode(wallet, this.network, this.chain)
        node.start()
        return node
    }

    getNetwork(): FakeNetwork {
        return this.network
    }
}
