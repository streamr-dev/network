import { EthereumAddress } from 'streamr-client-protocol'
import { FakeNetworkNode } from './FakeNetworkNode'

export class FakeNetwork {

    private readonly nodes: Map<EthereumAddress, FakeNetworkNode> = new Map()

    addNode(node: FakeNetworkNode): void {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node)
        } else {
            throw new Error(`Duplicate node: ${node.id}`)
        }
    }

    removeNode(address: EthereumAddress): void {
        this.nodes.delete(address)
    }

    getNode(address: EthereumAddress): FakeNetworkNode | undefined {
        return this.nodes.get(address)
    }

    getNodes(): FakeNetworkNode[] {
        return Array.from(this.nodes.values())
    }
}
