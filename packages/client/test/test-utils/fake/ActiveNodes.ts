import { EthereumAddress } from 'streamr-client-protocol'
import { Lifecycle, scoped } from 'tsyringe'
import { FakeBrubeckNode } from './FakeBrubeckNode'

@scoped(Lifecycle.ContainerScoped)
export class ActiveNodes {

    private nodes: Map<EthereumAddress, FakeBrubeckNode> = new Map()

    addNode(node: FakeBrubeckNode) {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node)
        } else {
            throw new Error(`Duplicate node: ${node.id}`)
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
