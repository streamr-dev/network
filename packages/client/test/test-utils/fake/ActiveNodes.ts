import { EthereumAddress } from 'streamr-client-protocol'
import { Lifecycle, scoped } from 'tsyringe'
import { FakeNetworkNode } from './FakeNetworkNode'

@scoped(Lifecycle.ContainerScoped)
export class ActiveNodes {

    private readonly nodes: Map<EthereumAddress, FakeNetworkNode> = new Map()

    addNode(node: FakeNetworkNode): void {
        const id = node.id.toLowerCase()
        if (!this.nodes.has(id)) {
            this.nodes.set(id, node)
        } else {
            throw new Error(`Duplicate node: ${id}`)
        }
    }

    removeNode(address: EthereumAddress): void {
        this.nodes.delete(address)
    }

    getNode(address: EthereumAddress): FakeNetworkNode | undefined {
        return this.nodes.get(address.toLowerCase())
    }

    getNodes(): FakeNetworkNode[] {
        return Array.from(this.nodes.values())
    }
}
