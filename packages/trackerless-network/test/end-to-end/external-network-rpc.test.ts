import { NetworkNode } from '../../src/NetworkNode'
import { NetworkStack } from '../../src/NetworkStack'
import {
    StreamPartHandshakeRequest,
    StreamPartHandshakeResponse
} from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { HandshakeRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { createMockPeerDescriptor } from '../utils/utils'

describe('ExternalNetworkRpc', () => {
    let clientNode: NetworkNode
    let serverNode: NetworkNode

    const serverPeerDescriptor = createMockPeerDescriptor({
        websocket: {
            host: '127.0.0.1',
            port: 15499,
            tls: false
        }
    })

    const clientPeerDescriptor = createMockPeerDescriptor()

    beforeEach(async () => {
        const clientStack = new NetworkStack({
            layer0: {
                entryPoints: [serverPeerDescriptor],
                peerDescriptor: clientPeerDescriptor,
                websocketServerEnableTls: false
            }
        })
        const serverStack = new NetworkStack({
            layer0: {
                entryPoints: [serverPeerDescriptor],
                peerDescriptor: serverPeerDescriptor,
                websocketServerEnableTls: false
            }
        })
        clientNode = new NetworkNode(clientStack)
        serverNode = new NetworkNode(serverStack)

        await serverNode.start()
        await clientNode.start()
    })

    afterEach(() => {
        serverNode.stop()
        clientNode.stop()
    })

    it('can make queries', async () => {
        const requestId = 'TEST'
        serverNode.registerExternalNetworkRpcMethod(
            StreamPartHandshakeRequest,
            StreamPartHandshakeResponse,
            'handshake',
            async () => StreamPartHandshakeResponse.create({ requestId })
        )
        const client = clientNode.createExternalRpcClient(HandshakeRpcClient)
        const response = await client.handshake(StreamPartHandshakeRequest.create(), {
            sourceDescriptor: clientPeerDescriptor,
            targetDescriptor: serverPeerDescriptor
        })
        expect(response.requestId).toEqual(requestId)
    })
})
