// import { BrubeckClient } from './BrubeckClient'
// import { SPID } from 'streamr-client-protocol'
import { JsonRpcProvider } from '@ethersproject/providers'
import * as StorageNodeRegistryConfig from 'streamr-client-protocol/contracts/NodeRegistry.json'
import { Contract } from '@ethersproject/contracts'
import { Context } from '../utils/Context'
import { Debug } from '../utils/log'
import { instanceId } from '../utils'

export type NetworkSmartContract = {
    contractAddress: string
    jsonRpcProvider: string
}

export type NodeRegistryItem = {
    address: string
    url: string
}

export type NodeRegistryOptions = NetworkSmartContract

export default class NodeRegistry implements Context {
    contract
    id
    debug
    constructor(contract: Contract) {
        this.id = instanceId(this)
        this.debug = Debug(this.id)
        this.contract = contract
    }

    static async create({ contractAddress, jsonRpcProvider }: NodeRegistryOptions) {
        const provider = new JsonRpcProvider(jsonRpcProvider)
        // check that provider is connected and has some valid blockNumber
        await provider.getBlockNumber()

        const contract = new Contract(contractAddress, StorageNodeRegistryConfig.abi, provider)
        // check that contract is connected
        await contract.addressPromise
        return new NodeRegistry(contract)
    }

    async getNodes(): Promise<NodeRegistryItem[]> {
        const result = await this.contract.getNodes()
        return result.map((node: any) => {
            return {
                address: node.nodeAddress,
                url: JSON.parse(node.metadata).http,
            }
        })
    }
}
