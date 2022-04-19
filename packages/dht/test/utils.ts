import { Neighbor, NodeType } from '../src/proto/DhtRpc'

export const getMockNeighbors = (): Neighbor[] => {
    const n1: Neighbor = {
        peerId: 'Neighbor1',
        type: NodeType.NODEJS,
    }
    const n2: Neighbor = {
        peerId: 'Neighbor2',
        type: NodeType.NODEJS,
    }
    const n3: Neighbor = {
        peerId: 'Neighbor3',
        type: NodeType.NODEJS,
    }
    const n4: Neighbor = {
        peerId: 'Neighbor1',
        type: NodeType.BROWSER,
    }
    return [
        n1, n2, n3, n4
    ]
}