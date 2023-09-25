import { Message, NodeType, PeerDescriptor, PeerID, ClientWebSocket, ManagedConnection } from '@streamr/dht'
import { RoutingRpcCommunicator } from '@streamr/dht/dist/src/transport/RoutingRpcCommunicator'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { AutoCertifierServiceClient } from './proto/packages/autocertifier/protos/AutoCertifier.client'
import { Logger } from '@streamr/utils'
import { ConnectionType } from '@streamr/dht/dist/src/connection/IConnection'
import { FailedToConnectToStreamrWebSocket } from './errors'

const logger = new Logger(module)

export class StreamrChallenger {
    private readonly SERVICE_ID = 'AutoCertifier'
    private readonly protocolVersion = '1.0'

    private ownPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('AutoCertifierServer').value,
        type: NodeType.NODEJS,
    }

    public testStreamrChallenge(streamrWebSocketIp: string, streamrWebSocketPort: string,
        sessionId: string, _caCert?: string): Promise<void> {

        return new Promise((resolve, reject) => {

            const targetPeerDescriptor: PeerDescriptor = {
                kademliaId: PeerID.fromString('AutoCertifierClient').value,
                type: NodeType.NODEJS,
                websocket: {
                    ip: streamrWebSocketIp,
                    port: parseInt(streamrWebSocketPort)
                }
            }

            const socket = new ClientWebSocket()

            const address = 'ws://' + targetPeerDescriptor.websocket!.ip + ':' +
                targetPeerDescriptor.websocket!.port

            const managedConnection = new ManagedConnection(this.ownPeerDescriptor!, this.protocolVersion,
                ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
            managedConnection.setPeerDescriptor(targetPeerDescriptor!)

            const onDisconnected = () => {
                reject(new FailedToConnectToStreamrWebSocket('Autocertifier failed to connect to '
                    + address + '. Please chack that the IP address is not behind a NAT.'))
            }

            socket.on('disconnected', onDisconnected)

            managedConnection.on('handshakeCompleted', () => {
                socket.off('disconnected', onDisconnected)
                const communicator = new RoutingRpcCommunicator(this.SERVICE_ID,
                    (msg: Message, _doNotConnect?: boolean): Promise<void> => {
                        logger.info('sending message to peer')
                        return managedConnection.send(Message.toBinary(msg), true)
                    })

                managedConnection.on('managedData', (msg: Uint8Array) => {
                    communicator.handleMessageFromPeer(Message.fromBinary(msg))
                })

                const rpcClient = toProtoRpcClient(new AutoCertifierServiceClient(communicator.getRpcClientTransport()))

                rpcClient.getSessionId({ sessionId: sessionId }).then(() => {
                    resolve()
                }).catch((e) => {
                    reject(e)
                })
            })

            socket.connect(address)
        })
    }
}
