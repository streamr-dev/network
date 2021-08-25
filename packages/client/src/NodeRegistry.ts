/**
 * Handle async + lazy initialisation of storage node contract
 * and cache of storage node registry items.
 */
import { scoped, Lifecycle, inject, DependencyContainer } from 'tsyringe'
import { JsonRpcProvider } from '@ethersproject/providers'
import * as StorageNodeRegistryConfig from 'streamr-client-protocol/contracts/NodeRegistry.json'
import { Contract } from '@ethersproject/contracts'
import { Context, ContextError } from './utils/Context'
import { Debug } from './utils/log'
import { instanceId, pOnce } from './utils'

import { Config } from './Config'

export type NetworkSmartContract = {
    contractAddress: string
    jsonRpcProvider: string
}

export type NodeRegistryItem = {
    address: string
    url: string
}

export type NodeRegistryOptions = NetworkSmartContract | NodeRegistryItem[]

function isNetworkSmartContract(value: NodeRegistryOptions): value is NetworkSmartContract {
    return (
        !!value
        && typeof value === 'object'
        && !Array.isArray(value)
        && typeof value.contractAddress === 'string'
        && typeof value.jsonRpcProvider === 'string'
    )
}

export default abstract class AbstractNodeRegistry implements Context {
    id
    debug
    constructor(@inject(Config.NodeRegistry) protected options: NodeRegistryOptions) {
        this.id = instanceId(this)
        this.debug = Debug(this.id)
    }

    async getNodes(): Promise<NodeRegistryItem[]> {
        throw new ContextError(this, 'not implemented: getNodes()')
    }

    // eslint-disable-next-line class-methods-use-this
    async stop(): Promise<void> {
    }

    async getStorageUrl(address: string) {
        const nodes = await this.getNodes()
        const found = nodes.find((p) => p.address === address)
        if (!found) {
            throw new ContextError(this, `Storage node with address (${address}) not found in registry`)
        }

        return found.url
    }
}

@scoped(Lifecycle.ContainerScoped)
class NodeRegistryStatic extends AbstractNodeRegistry {
    constructor(@inject(Config.NodeRegistry) protected nodes: NodeRegistryItem[]) {
        super(nodes)
    }

    async getNodes(): Promise<NodeRegistryItem[]> {
        return this.nodes
    }
}

@scoped(Lifecycle.ContainerScoped)
class NodeRegistryContract extends AbstractNodeRegistry {
    private didInitialize = false
    constructor(@inject(Config.NodeRegistry) private networkSmartContract: NetworkSmartContract) {
        super(networkSmartContract)
    }

    getContract = pOnce(async () => {
        this.didInitialize = true
        const provider = new JsonRpcProvider(this.networkSmartContract.jsonRpcProvider)
        // check that provider is connected and has some valid blockNumber
        await provider.getBlockNumber()
        const contract = new Contract(this.networkSmartContract.contractAddress, StorageNodeRegistryConfig.abi, provider)
        // check that contract is connected
        await contract.addressPromise
        return contract
    })

    async getNodes(): Promise<NodeRegistryItem[]> {
        const contract = await this.getContract()
        const nodes = await contract.getNodes()
        return nodes.map((node: any) => {
            return {
                address: node.nodeAddress,
                url: JSON.parse(node.metadata).http,
            }
        })
    }

    async stop() {
        if (!this.didInitialize) {
            return
        }

        const contractTask = this.getContract()
        this.getContract.reset()
        this.didInitialize = false
        const contract = await contractTask
        contract.removeAllListeners()
        contract.provider.removeAllListeners()
    }
}

/**
 * Toggle which class is instantiated based on node registry config.
 * If config is NetworkSmartContract use NodeRegistryContract
 * otherwise use NodeRegistryStatic
 */
export function register(container: DependencyContainer) {
    if (isNetworkSmartContract(container.resolve(Config.NodeRegistry))) {
        container.register(AbstractNodeRegistry as any, {
            useClass: NodeRegistryContract
        }, { lifecycle: Lifecycle.ContainerScoped })
    } else {
        container.register(AbstractNodeRegistry as any, {
            useClass: NodeRegistryStatic
        }, { lifecycle: Lifecycle.ContainerScoped })
    }
}
