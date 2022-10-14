import { RandomContactList } from '../../src/dht/contact/RandomContactList'
import type { ServiceInfo, MethodInfo } from "@protobuf-ts/runtime-rpc"
import { PeerID } from '../../src/helpers/PeerID'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { IDhtRpcServiceClient } from '../../src/proto/DhtRpc.client'
import { NodeType, PeerDescriptor, RouteMessageAck, RouteMessageWrapper } from "../../src/proto/DhtRpc"
import type { PingResponse } from "../../src/proto//DhtRpc"
import type { PingRequest } from "../../src/proto//DhtRpc"
import type { ClosestPeersResponse } from "../../src/proto//DhtRpc"
import type { ClosestPeersRequest } from "../../src/proto//DhtRpc"
import { UnaryCall } from "@protobuf-ts/runtime-rpc"
import type { RpcOptions } from "@protobuf-ts/runtime-rpc"
import { DhtPeer } from '../../src/dht/DhtPeer'
import { IMessageType } from '@protobuf-ts/runtime'

class MockRpcClient implements IDhtRpcServiceClient, ServiceInfo {
    typeName = 'MockRpcClient'
    methods: MethodInfo<any, any> [] = [
        { name: 'getClosestPeers', O: {} as IMessageType<ClosestPeersResponse> } as MethodInfo<any, any>,
        { name: 'ping', O: {} as IMessageType<PingResponse> } as MethodInfo<any, any>,
        { name: 'routeMessage', O: {} as IMessageType<RouteMessageAck> } as MethodInfo<any, any>,
    ]
    options = {}

    // eslint-disable-next-line class-methods-use-this
    getClosestPeers(_input: ClosestPeersRequest, _options?: RpcOptions): UnaryCall<ClosestPeersRequest, ClosestPeersResponse> {
        return {} as  UnaryCall<ClosestPeersRequest, ClosestPeersResponse>
    }

    // eslint-disable-next-line class-methods-use-this
    ping(_input: PingRequest, _options?: RpcOptions): UnaryCall <PingRequest, PingResponse> {
        return {} as UnaryCall<PingRequest, PingResponse>
    }

    // eslint-disable-next-line class-methods-use-this
    routeMessage(_input: RouteMessageWrapper, _options?: RpcOptions): UnaryCall<RouteMessageWrapper, RouteMessageAck> {
        return {} as UnaryCall<RouteMessageWrapper, RouteMessageAck>
    }

    forwardMessage(_input: RouteMessageWrapper, _options?: RpcOptions): UnaryCall<RouteMessageWrapper, RouteMessageAck> {
        return {} as UnaryCall<RouteMessageWrapper, RouteMessageAck>
    }
}

describe('RandomContactList', () => {
    const id0 = PeerID.fromValue(Buffer.from([0, 0, 0, 0]))
    const id1 = PeerID.fromValue(Buffer.from([0, 0, 0, 1]))
    const id2 = PeerID.fromValue(Buffer.from([0, 0, 0, 2]))
    const id3 = PeerID.fromValue(Buffer.from([0, 0, 0, 3]))
    const id4 = PeerID.fromValue(Buffer.from([0, 0, 0, 4]))

    const descriptor1: PeerDescriptor = { peerId: id1.value, type: NodeType.NODEJS }
    const descriptor2: PeerDescriptor = { peerId: id2.value, type: NodeType.NODEJS }
    const descriptor3: PeerDescriptor = { peerId: id3.value, type: NodeType.NODEJS }
    const descriptor4: PeerDescriptor = { peerId: id4.value, type: NodeType.NODEJS }

    const peer1 = new DhtPeer(descriptor1, toProtoRpcClient(new MockRpcClient()))
    const peer2 = new DhtPeer(descriptor2, toProtoRpcClient(new MockRpcClient()))
    const peer3 = new DhtPeer(descriptor3, toProtoRpcClient(new MockRpcClient()))
    const peer4 = new DhtPeer(descriptor4, toProtoRpcClient(new MockRpcClient()))

    it('adds contacts correctly', () => {
        const list = new RandomContactList(id0, 5, 1)
        list.addContact(peer1)
        list.addContact(peer2)
        list.addContact(peer3)
        list.addContact(peer3)
        list.addContact(peer4)
        list.addContact(peer4)
        expect(list.getSize()).toEqual(4)
    })

    it('removes contacts correctly', () => {
        const list = new RandomContactList(id0, 5, 1)
        list.addContact(peer1)
        list.addContact(peer2)
        list.removeContact(id2)
        expect(list.getContact(id1)).toBeTruthy()
        expect(list.getSize()).toEqual(1)

    })

})
