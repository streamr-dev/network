import { SortedContactList } from '../../src/dht/contact/SortedContactList'
import type { ServiceInfo, MethodInfo } from "@protobuf-ts/runtime-rpc"
import { PeerID } from '../../src/helpers/PeerID'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { IDhtRpcServiceClient } from '../../src/proto/packages/dht/protos/DhtRpc.client'
import { LeaveNotice, NodeType, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from "../../src/proto/packages/dht/protos/DhtRpc"
import type { PingResponse } from "../../src/proto/packages/dht/protos/DhtRpc"
import type { PingRequest } from "../../src/proto/packages/dht/protos/DhtRpc"
import type { ClosestPeersResponse } from "../../src/proto/packages/dht/protos/DhtRpc"
import type { ClosestPeersRequest } from "../../src/proto/packages/dht/protos/DhtRpc"
import { UnaryCall } from "@protobuf-ts/runtime-rpc"
import type { RpcOptions } from "@protobuf-ts/runtime-rpc"
import { DhtPeer } from '../../src/dht/DhtPeer'
import { IMessageType } from '@protobuf-ts/runtime'
import { Empty } from '../../src/proto/google/protobuf/empty'

/* eslint-disable class-methods-use-this */
class MockRpcClient implements IDhtRpcServiceClient, ServiceInfo {
    typeName = 'MockRpcClient'
    methods: MethodInfo<any, any> [] = [
        { name: 'getClosestPeers', O: {} as IMessageType<ClosestPeersResponse> } as MethodInfo<any, any>,
        { name: 'ping', O: {} as IMessageType<PingResponse> } as MethodInfo<any, any>,
        { name: 'routeMessage', O: {} as IMessageType<RouteMessageAck> } as MethodInfo<any, any>,
        { name: 'findRecursively', O: {} as IMessageType<RouteMessageAck> } as MethodInfo<any, any>,
        { name: 'forwardMessage', O: {} as IMessageType<RouteMessageAck> } as MethodInfo<any, any>,
        { name: 'leaveNotice', O: {} as IMessageType<Empty> } as MethodInfo<any, any>
    ]
    options = {}
    getClosestPeers(_input: ClosestPeersRequest, _options?: RpcOptions): UnaryCall<ClosestPeersRequest, ClosestPeersResponse> {
        return {} as  UnaryCall<ClosestPeersRequest, ClosestPeersResponse>
    }
    ping(_input: PingRequest, _options?: RpcOptions): UnaryCall <PingRequest, PingResponse> {
        return {} as UnaryCall<PingRequest, PingResponse>
    }

    routeMessage(_input: RouteMessageWrapper, _options?: RpcOptions): UnaryCall<RouteMessageWrapper, RouteMessageAck> {
        return {} as UnaryCall<RouteMessageWrapper, RouteMessageAck>
    }

    findRecursively(_input: RouteMessageWrapper, _options?: RpcOptions): UnaryCall<RouteMessageWrapper, RouteMessageAck> {
        return {} as UnaryCall<RouteMessageWrapper, RouteMessageAck>
    }

    forwardMessage(_input: RouteMessageWrapper, _options?: RpcOptions): UnaryCall<RouteMessageWrapper, RouteMessageAck> {
        return {} as UnaryCall<RouteMessageWrapper, RouteMessageAck>
    }

    leaveNotice(_input: LeaveNotice, _options?: RpcOptions): UnaryCall<LeaveNotice, Empty> {
        return {} as UnaryCall<LeaveNotice, Empty>
    }
}

describe('SortedContactList', () => {
    const serviceId = 'sorted'
    const id0 = PeerID.fromValue(Buffer.from([0, 0, 0, 0]))
    const id1 = PeerID.fromValue(Buffer.from([0, 0, 0, 1]))
    const id2 = PeerID.fromValue(Buffer.from([0, 0, 0, 2]))
    const id3 = PeerID.fromValue(Buffer.from([0, 0, 0, 3]))
    const id4 = PeerID.fromValue(Buffer.from([0, 0, 0, 4]))

    const descriptor0: PeerDescriptor = { kademliaId: id0.value, type: NodeType.NODEJS }
    const descriptor1: PeerDescriptor = { kademliaId: id1.value, type: NodeType.NODEJS }
    const descriptor2: PeerDescriptor = { kademliaId: id2.value, type: NodeType.NODEJS }
    const descriptor3: PeerDescriptor = { kademliaId: id3.value, type: NodeType.NODEJS }
    const descriptor4: PeerDescriptor = { kademliaId: id4.value, type: NodeType.NODEJS }

    const peer1 = new DhtPeer(descriptor0, descriptor1, toProtoRpcClient(new MockRpcClient()), serviceId)
    const peer2 = new DhtPeer(descriptor0, descriptor2, toProtoRpcClient(new MockRpcClient()), serviceId)
    const peer3 = new DhtPeer(descriptor0, descriptor3, toProtoRpcClient(new MockRpcClient()), serviceId)
    const peer4 = new DhtPeer(descriptor0, descriptor4, toProtoRpcClient(new MockRpcClient()), serviceId)

    it('compares Ids correctly', async () => {
        const list = new SortedContactList(id0, 10)
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

        const list = new SortedContactList(id0, 10)

        list.addContact(peer3)
        list.addContact(peer2)
        list.addContact(peer1)

        const contacts = list.getUncontactedContacts(3)
        expect(contacts.length).toEqual(3)
        expect(contacts[0]).toEqual(peer1)
        expect(contacts[1]).toEqual(peer2)
        expect(contacts[2]).toEqual(peer3)
    })
    
    it('handles contacted nodes correctly', async () => {
        const list = new SortedContactList(id0, 10)

        list.addContact(peer3)
        list.addContact(peer2)
        list.addContact(peer1)

        list.setContacted(id2)
        const contacts = list.getUncontactedContacts(3)
        expect(contacts.length).toEqual(2)
        expect(contacts[0]).toEqual(peer1)
        expect(contacts[1]).toEqual(peer3)
    })

    it('cannot exceed maxSize', async () => {
        const list = new SortedContactList(id0, 3)
        list.addContact(peer4)
        list.addContact(peer3)
        list.addContact(peer2)
        list.addContact(peer1)
        expect(list.getSize()).toEqual(3)
        expect(list.getContact(id4)).toBeFalsy()
    })

    it('removing contacts', async () => {
        const list = new SortedContactList(id0, 8)
        list.addContact(peer4)
        list.addContact(peer3)
        list.addContact(peer2)
        list.addContact(peer1)
        list.removeContact(id2)
        expect(list.getSize()).toEqual(3)
        expect(list.getContact(id2)).toBeFalsy()
        expect(list.getContactIds()).toEqual(list.getContactIds().sort(list.compareIds))
        const ret = list.removeContact(PeerID.fromValue(Buffer.from([0, 0, 0, 6])))
        expect(ret).toEqual(false)
    })
})
