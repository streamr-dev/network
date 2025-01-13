import { Message } from '@streamr/dht'
import { ExternalNetworkRpc, SERVICE_ID } from '../../src/logic/ExternalNetworkRpc'
import { HandshakeRequest, HandshakeResponse } from '../../generated/packages/dht/protos/DhtRpc'
import { MockTransport } from '../utils/mock/MockTransport'
import { RpcMessage } from '@streamr/proto-rpc'
import { Any } from '../../generated/google/protobuf/any'
import { HandshakeRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'

describe('ExternalNetworkRpc', () => {
    let rpc: ExternalNetworkRpc
    let fn: jest.Mock
    let transport: MockTransport

    beforeEach(() => {
        transport = new MockTransport()
        rpc = new ExternalNetworkRpc(transport)
        fn = jest.fn()
    })

    afterEach(() => {
        rpc.destroy()
    })

    it('registers method', async () => {
        rpc.registerRpcMethod(HandshakeRequest, HandshakeResponse, 'handshake', () => fn())
        transport.emit(
            'message',
            Message.create({
                serviceId: SERVICE_ID,
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: RpcMessage.create({
                        header: {
                            request: 'request',
                            method: 'handshake'
                        },
                        body: Any.pack(HandshakeRequest.create(), HandshakeRequest)
                    })
                }
            })
        )
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('creates clients', async () => {
        const client = rpc.createRpcClient(HandshakeRpcClient)
        expect(client.methods.length).toEqual(2)
    })
})
