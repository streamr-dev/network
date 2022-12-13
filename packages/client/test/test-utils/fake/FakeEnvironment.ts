import { container, DependencyContainer } from 'tsyringe'
import { merge } from 'lodash'
import { fastPrivateKey, fastWallet } from '@streamr/test-utils'
import { StreamrClientConfig } from '../../../src/Config'
import { StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { StreamrClient } from '../../../src/StreamrClient'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'
import { FakeHttpUtil } from './FakeHttpUtil'
import { HttpUtil } from '../../../src/HttpUtil'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'
import { FakeNetworkNodeFactory, FakeNetworkNode } from './FakeNetworkNode'
import { NetworkNodeFactory } from '../../../src/NetworkNodeFacade'
import { LoggerFactory } from './../../../src/utils/LoggerFactory'
import { FakeNetwork } from './FakeNetwork'
import { FakeChain } from './FakeChain'
import { FakeLogger } from './FakeLogger'
import { FakeStorageNode } from './FakeStorageNode'
import { NodeId } from '@streamr/trackerless-network'

const DEFAULT_CLIENT_OPTIONS: StreamrClientConfig = {
    network: {
        layer0: {
            entryPoints: [{
                kademliaId: 'Entrypoint',
                type: 0
            }]
        }
    },
    metrics: false
}

export class FakeEnvironment {
    private network: FakeNetwork
    private chain: FakeChain
    private logger: FakeLogger
    private dependencyContainer: DependencyContainer
    private clients: StreamrClient[] = []

    constructor() {
        this.network = new FakeNetwork()
        this.chain = new FakeChain()
        this.logger = new FakeLogger()
        this.dependencyContainer = container.createChildContainer()
        const httpUtil = new FakeHttpUtil(this.network)
        const loggerFactory = {
            createLogger: () => this.logger
        }
        this.dependencyContainer.register(FakeNetwork, { useValue: this.network })
        this.dependencyContainer.register(FakeChain, { useValue: this.chain })
        this.dependencyContainer.register(LoggerFactory, { useValue: loggerFactory } as any)
        this.dependencyContainer.register(HttpUtil, { useValue: httpUtil as any })
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
        const client = new StreamrClient(configWithDefaults, this.dependencyContainer)
        this.clients.push(client)
        return client
    }

    startNode(nodeId: NodeId): FakeNetworkNode {
        const node = new FakeNetworkNode({
            networkNode: {
                id: nodeId
            }
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

    getLogger(): FakeLogger {
        return this.logger
    }

    destroy(): Promise<unknown> {
        return Promise.all(this.clients.map((client) => client.destroy()))
    }
}
