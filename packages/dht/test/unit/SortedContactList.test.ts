/* eslint-disable @typescript-eslint/no-unused-vars */

import { SortedContactList } from '../../src/dht/SortedContactList'
import { PeerID } from '../../src/PeerID'
import { IDhtRpcClient } from '../../src/proto/DhtRpc.client'
import { NodeType, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from "../../src/proto/DhtRpc"
import type { PingResponse } from "../../src/proto//DhtRpc"
import type { PingRequest } from "../../src/proto//DhtRpc"
import type { ClosestPeersResponse } from "../../src/proto//DhtRpc"
import type { ClosestPeersRequest } from "../../src/proto//DhtRpc"
import { UnaryCall } from "@protobuf-ts/runtime-rpc"
import type { RpcOptions } from "@protobuf-ts/runtime-rpc"
import { DhtPeer } from '../../src/dht/DhtPeer'

class MockRpcClient implements IDhtRpcClient {
    getClosestPeers(input: ClosestPeersRequest, options?: RpcOptions): UnaryCall<ClosestPeersRequest, ClosestPeersResponse> {
        return {} as  UnaryCall<ClosestPeersRequest, ClosestPeersResponse>
    }
    ping(input: PingRequest, options?: RpcOptions): UnaryCall <PingRequest, PingResponse> {
        return {} as UnaryCall<PingRequest, PingResponse>
    }

    routeMessage(input: RouteMessageWrapper, options?: RpcOptions): UnaryCall<RouteMessageWrapper, RouteMessageAck> {
        return {} as UnaryCall<RouteMessageWrapper, RouteMessageAck>
    }
}

describe('SortedContactList', () => {
    const id0 = PeerID.fromValue(Buffer.from([0, 0, 0, 0]))
    const id1 = PeerID.fromValue(Buffer.from([0, 0, 0, 1]))
    const id2 = PeerID.fromValue(Buffer.from([0, 0, 0, 2]))
    const id3 = PeerID.fromValue(Buffer.from([0, 0, 0, 3]))
    const id4 = PeerID.fromValue(Buffer.from([0, 0, 0, 4]))

    const descriptor1: PeerDescriptor = { peerId: id1.value, type: NodeType.NODEJS }
    const descriptor2: PeerDescriptor = { peerId: id2.value, type: NodeType.NODEJS}
    const descriptor3: PeerDescriptor = { peerId: id3.value, type: NodeType.NODEJS}
    
    const peer1 = new DhtPeer(descriptor1, new MockRpcClient())
    const peer2 = new DhtPeer(descriptor2, new MockRpcClient())
    const peer3 = new DhtPeer(descriptor3, new MockRpcClient())

    it('compares Ids correctly', async () => {
        const list = new SortedContactList(id0)
        expect(list.compareIds(id0, id0)).toBe(0)
        expect(list.compareIds(id1, id1)).toBe(0)
        expect(list.compareIds(id0, id1)).toBe(-1)
        expect(list.compareIds(id0, id2)).toBe(-2)
        expect(list.compareIds(id1, id0)).toBe(1)
        expect(list.compareIds(id2, id0)).toBe(2)
        expect(list.compareIds(id2, id3)).toBe(-1)
        expect(list.compareIds(id1, id4)).toBe(-3)
    })

    it('orders itself correctly', async () => {

        const list = new SortedContactList(id0)

        list.addContact(peer3)
        list.addContact(peer2)
        list.addContact(peer1)

        const contacts = list.getUncontactedContacts(3)
        expect(contacts).toHaveLength(3)
        expect(contacts[0]).toEqual(peer1)
        expect(contacts[1]).toEqual(peer2)
        expect(contacts[2]).toEqual(peer3)
    })

    it('handles contacted nodes correctly', async () => {
        const list = new SortedContactList(id0)

        list.addContact(peer3)
        list.addContact(peer2)
        list.addContact(peer1)

        list.setContacted(id2)
        const contacts = list.getUncontactedContacts(3)
        expect(contacts).toHaveLength(2)
        expect(contacts[0]).toEqual(peer1)
        expect(contacts[1]).toEqual(peer3)
    })
})
