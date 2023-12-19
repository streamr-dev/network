import { hexToBinary } from '@streamr/utils'
import { PeerManager, getDistance } from '../../src/dht/PeerManager'
import { NodeID, createRandomNodeId, getNodeIdFromBinary } from '../../src/identifiers'
import { NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { range, sampleSize, sortBy, without } from 'lodash'
import { DhtNodeRpcRemote } from '../../src/dht/DhtNodeRpcRemote'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'

describe('PeerManager', () => {

    it('getClosestContactsTo', () => {
        const nodeIds = range(10).map(() => getNodeIdFromBinary(createRandomNodeId()))
        const manager = new PeerManager({
            localNodeId: getNodeIdFromBinary(createRandomNodeId()),
            createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => {
                return new DhtNodeRpcRemote(undefined as any, peerDescriptor, undefined as any, new MockRpcCommunicator())
            }
        } as any)
        manager.handleNewPeers(nodeIds.map((n) => ({ nodeId: hexToBinary(n), type: NodeType.NODEJS })))

        const referenceId = getNodeIdFromBinary(createRandomNodeId())
        const excluded = new Set<NodeID>(sampleSize(nodeIds, 2)!)
        const actual = manager.getClosestContactsTo(referenceId, 5, excluded)

        const expected = sortBy(
            without(nodeIds, ...Array.from(excluded.values())),
            (n: NodeID) => getDistance(n, referenceId)
        ).slice(0, 5)
        expect(actual.map((n) => n.getNodeId())).toEqual(expected)
    })
})
