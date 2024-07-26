import { Message } from '@streamr/dht'
import { ExternalNetworkRpc, SERVICE_ID } from '../../src/logic/ExternalNetworkRpc'
import { HandshakeRequest, HandshakeResponse } from '../../src/proto/packages/dht/protos/DhtRpc'
import { MockTransport } from '../utils/mock/MockTransport'
import { RpcMessage } from '@streamr/proto-rpc'
import { Any } from '../../src/proto/google/protobuf/any'

describe('ExternalNetworkRpc', () => {

    let rpc: ExternalNetworkRpc
    let fn: jest.Mock
    let transport: MockTransport

    beforeEach(() => {
        transport = new MockTransport
        rpc = new ExternalNetworkRpc(transport)
        fn = jest.fn()
    })

    afterEach(() => {
        rpc.destroy()
    })

    it('registers method', async () => {
        rpc.registerRpcMethod(HandshakeRequest, HandshakeResponse, 'handshake', () => fn())
        transport.emit('message', Message.create({
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
        }))
        expect(fn).toHaveBeenCalledTimes(1)
    })
    
})
