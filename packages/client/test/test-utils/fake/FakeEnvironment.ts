import { fastPrivateKey, fastWallet } from '@streamr/test-utils'
import merge from 'lodash/merge'
import { DependencyContainer, container } from 'tsyringe'
import { StreamrClientConfig } from '../../../src/Config'
import { NetworkNodeFactory } from '../../../src/NetworkNodeFacade'
import { StreamrClient } from '../../../src/StreamrClient'
import { MIN_KEY_LENGTH } from '../../../src/encryption/RSAKeyPair'
import { StorageNodeRegistry } from '../../../src/registry/StorageNodeRegistry'
import { StreamRegistry } from '../../../src/registry/StreamRegistry'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { LoggerFactory } from './../../../src/utils/LoggerFactory'
import { FakeChain } from './FakeChain'
import { FakeLogger } from './FakeLogger'
import { FakeNetwork } from './FakeNetwork'
import { FakeNetworkNode, FakeNetworkNodeFactory } from './FakeNetworkNode'
import { FakeStorageNode } from './FakeStorageNode'
import { NodeId } from '@streamr/trackerless-network'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'

const DEFAULT_CLIENT_OPTIONS: StreamrClientConfig = {
    network: {
        layer0: {
            entryPoints: [{
                kademliaId: 'Entrypoint',
                type: 0
            }]
        }
    },
    encryption: {
        rsaKeyLength: MIN_KEY_LENGTH
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
        const loggerFactory = {
            createLogger: () => this.logger
        }
        this.dependencyContainer.register(FakeNetwork, { useValue: this.network })
        this.dependencyContainer.register(FakeChain, { useValue: this.chain })
        this.dependencyContainer.register(LoggerFactory, { useValue: loggerFactory } as any)
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

    async startStorageNode(): Promise<FakeStorageNode> {
        const wallet = fastWallet()
        const node = new FakeStorageNode(wallet, this.network, this.chain)
        await node.start()
        return node
    }

    getNetwork(): FakeNetwork {
        return this.network
    }

    getChain(): FakeChain {
        return this.chain
    }

    getLogger(): FakeLogger {
        return this.logger
    }

    async destroy(): Promise<void> {
        await Promise.all(this.clients.map((client) => client.destroy()))
        await Promise.all(this.network.getNodes().map((node) => node.stop()))
    }
}
