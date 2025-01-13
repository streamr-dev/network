import { until } from '@streamr/utils'
import { ListeningRpcCommunicator } from '../../src/transport/ListeningRpcCommunicator'
import { MockTransport } from '../utils/mock/MockTransport'
import { createMockPeerDescriptor } from '../utils/utils'
import { RpcMessage } from '@streamr/proto-rpc'
import { Deferred, RpcMetadata, RpcStatus } from '@protobuf-ts/runtime-rpc'

const createDeferredPromises = () => {
    const defHeader = new Deferred<RpcMetadata>()
    const defMessage = new Deferred<any>()
    const defStatus = new Deferred<RpcStatus>()
    const defTrailer = new Deferred<RpcMetadata>()

    const deferredParser = () => {}
    return {
        message: defMessage,
        header: defHeader,
        trailer: defTrailer,
        status: defStatus,
        messageParser: deferredParser as any
    }
}

describe('ListeningRpcCommunicator', () => {
    const SERVICE_ID = 'test'
    let rpcCommunicator: ListeningRpcCommunicator
    let transport: MockTransport

    beforeEach(() => {
        transport = new MockTransport()
        rpcCommunicator = new ListeningRpcCommunicator(SERVICE_ID, transport)
    })

    afterEach(() => {
        rpcCommunicator.destroy()
        transport.stop()
    })

    it('rejects requests on disconnect event to the target', async () => {
        const peerDescriptor = createMockPeerDescriptor()
        rpcCommunicator
            .getRpcClientTransport()
            .emit('rpcRequest', RpcMessage.create(), { targetDescriptor: peerDescriptor }, createDeferredPromises())
        await until(() => rpcCommunicator.getRequestIds(() => true).length > 0)
        transport.emit('disconnected', peerDescriptor, false)
        await until(() => rpcCommunicator.getRequestIds(() => true).length === 0)
    }, 10000)
})
