import { scoped, Lifecycle, inject } from 'tsyringe'
import { JsonRpcProvider } from '@ethersproject/providers'
import * as StorageNodeRegistryConfig from 'streamr-client-protocol/contracts/NodeRegistry.json'
import { Contract } from '@ethersproject/contracts'
import { Context } from './utils/Context'
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

export type NodeRegistryOptions = NetworkSmartContract

@scoped(Lifecycle.ContainerScoped)
export default class NodeRegistry implements Context {
    id
    debug
    private didInitialize = false
    constructor(@inject(Config.NodeRegistry) private options: NodeRegistryOptions) {
        this.id = instanceId(this)
        this.debug = Debug(this.id)
    }

    getContract = pOnce(async () => {
        this.didInitialize = true
        const provider = new JsonRpcProvider(this.options.jsonRpcProvider)
        // check that provider is connected and has some valid blockNumber
        await provider.getBlockNumber()
        const contract = new Contract(this.options.contractAddress, StorageNodeRegistryConfig.abi, provider)
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
