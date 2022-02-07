import { EthereumAddress } from 'streamr-client-protocol'
import { Lifecycle, scoped } from 'tsyringe'
import { FakeBrubeckNode } from './FakeBrubeckNode'

@scoped(Lifecycle.ContainerScoped)
export class FakeBrubeckNodeRegistry {

    private nodes: Map<EthereumAddress, FakeBrubeckNode> = new Map()

    addNode(node: FakeBrubeckNode) {
        const address = node.getAddress().toLowerCase()
        if (!this.nodes.has(address)) {
            this.nodes.set(address, node)
        } else {
            throw new Error(`Duplicate node: ${address}`)
        }
    }

    removeNode(address: EthereumAddress) {
        this.nodes.delete(address)
    }

    getNode(address: EthereumAddress) {
        return this.nodes.get(address.toLowerCase())
    }

    getNodes() {
        return Array.from(this.nodes.values())
    }
}
