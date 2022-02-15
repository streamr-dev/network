import { EthereumAddress } from 'streamr-client-protocol'
import { Lifecycle, scoped } from 'tsyringe'
import { FakeBrubeckNode } from './FakeBrubeckNode'

@scoped(Lifecycle.ContainerScoped)
export class ActiveNodes {

    private readonly nodes: Map<EthereumAddress, FakeBrubeckNode> = new Map()

    addNode(node: FakeBrubeckNode): void {
        if (!this.nodes.has(node.id)) {
            this.nodes.set(node.id, node)
        } else {
            throw new Error(`Duplicate node: ${node.id}`)
        }
    }

    removeNode(address: EthereumAddress): void {
        this.nodes.delete(address)
    }

    getNode(address: EthereumAddress): FakeBrubeckNode | undefined {
        return this.nodes.get(address.toLowerCase())
    }

    getNodes(): FakeBrubeckNode[] {
        return Array.from(this.nodes.values())
    }
}
