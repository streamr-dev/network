import { PeerManager, getDistance } from '../../src/dht/PeerManager'
import { NodeID, createRandomNodeId, getRawFromNodeId } from '../../src/identifiers'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { range, sampleSize, sortBy, without } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'

describe('PeerManager', () => {

    it('getClosestContactsTo', () => {
        const nodeIds = range(10).map(() => createRandomNodeId())
        const manager = new PeerManager({
            localNodeId: createRandomNodeId(),
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => {
                return new DhtNodeRpcRemote(undefined as any, peerDescriptor, undefined as any, new MockRpcCommunicator())
            }
        } as any)
        manager.handleNewPeers(nodeIds.map((n) => ({ nodeId: getRawFromNodeId(n), type: NodeType.NODEJS })))

        const referenceId = createRandomNodeId()
        const excluded = new Set<NodeID>(sampleSize(nodeIds, 2)!)
        const actual = manager.getClosestContactsTo(referenceId, 5, excluded)

        const expected = sortBy(
            without(nodeIds, ...Array.from(excluded.values())),
            (n: NodeID) => getDistance(getRawFromNodeId(n), getRawFromNodeId(referenceId))
        ).slice(0, 5)
        expect(actual.map((n) => n.getNodeId())).toEqual(expected)
    })
})
