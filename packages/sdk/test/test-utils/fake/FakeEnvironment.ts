import merge from 'lodash/merge'
import { DependencyContainer, container } from 'tsyringe'
import type { StreamrClientConfig } from '../../../src/ConfigTypes'
import { NetworkNodeFacade, NetworkNodeFactory } from '../../../src/NetworkNodeFacade'
import { StreamrClient } from '../../../src/StreamrClient'
import { ERC1271ContractFacade } from '../../../src/contracts/ERC1271ContractFacade'
import { OperatorRegistry } from '../../../src/contracts/OperatorRegistry'
import { StorageNodeRegistry } from '../../../src/contracts/StorageNodeRegistry'
import { StreamRegistry } from '../../../src/contracts/StreamRegistry'
import { StreamStorageRegistry } from '../../../src/contracts/StreamStorageRegistry'
import { MIN_KEY_LENGTH } from '../../../src/encryption/RSAKeyPair'
import { LoggerFactory } from './../../../src/utils/LoggerFactory'
import { FakeChain } from './FakeChain'
import { FakeERC1271ContractFacade } from './FakeERC1271ContractFacade'
import { FakeLogger } from './FakeLogger'
import { FakeNetwork } from './FakeNetwork'
import { FakeNetworkNodeFactory } from './FakeNetworkNode'
import { FakeOperatorRegistry } from './FakeOperatorRegistry'
import { FakeStorageNode } from './FakeStorageNode'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FakeStreamRegistry } from './FakeStreamRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'
import { DestroySignal } from '../../../src/DestroySignal'

const DEFAULT_CLIENT_OPTIONS: StreamrClientConfig = {
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
    private destroySignal = new DestroySignal()

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
        this.dependencyContainer.register(ERC1271ContractFacade, FakeERC1271ContractFacade as any)
        this.dependencyContainer.register(NetworkNodeFactory, FakeNetworkNodeFactory)
        this.dependencyContainer.register(StreamRegistry, FakeStreamRegistry as any)
        this.dependencyContainer.register(StreamStorageRegistry, FakeStreamStorageRegistry as any)
        this.dependencyContainer.register(StorageNodeRegistry, FakeStorageNodeRegistry as any)
        this.dependencyContainer.register(OperatorRegistry, FakeOperatorRegistry as any)
    }

    createClient(opts?: StreamrClientConfig): StreamrClient {
        const configWithDefaults = merge({}, DEFAULT_CLIENT_OPTIONS, opts)
        const client = new StreamrClient(configWithDefaults, this.dependencyContainer)
        this.destroySignal.onDestroy.listen(async () => {
            await client.destroy()
        })
        return client
    }

    createNode(opts?: StreamrClientConfig): NetworkNodeFacade {
        const client = this.createClient(opts)
        return client.getNode()
    }

    async startStorageNode(): Promise<FakeStorageNode> {
        const node = new FakeStorageNode(this)
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

    getDestroySignal(): DestroySignal {
        return this.destroySignal
    }

    async destroy(): Promise<void> {
        this.destroySignal.trigger()
    }
}
