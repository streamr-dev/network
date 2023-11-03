import { Message, NodeType, PeerDescriptor, PeerID, ClientWebSocket, ManagedConnection, RoutingRpcCommunicator } from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { ConnectionType } from '@streamr/dht'
import { FailedToConnectToStreamrWebSocket, AutoCertifierRpcClient, AUTOCERTIFIER_SERVICE_ID } from '@streamr/autocertifier-client'

const logger = new Logger(module)

// This is a dummy peer descriptor that is used to connect to the streamr websocket
// To ensure that the autocertified subdomain is used for the Streamr Network
const localPeerDescriptor: PeerDescriptor = {
    kademliaId: PeerID.fromString('AutoCertifierServer').value,
    type: NodeType.NODEJS,
}

export const runStreamrChallenge = (
    streamrWebSocketIp: string,
    streamrWebSocketPort: string,
    sessionId: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const remotePeerDescriptor: PeerDescriptor = {
            kademliaId: PeerID.fromString('AutoCertifierClient').value,
            type: NodeType.NODEJS,
            websocket: {
                host: streamrWebSocketIp,
                port: parseInt(streamrWebSocketPort),
                tls: true
            }
        }
        const socket = new ClientWebSocket()
        const address = 'wss://' + remotePeerDescriptor.websocket!.host + ':' +
        remotePeerDescriptor.websocket!.port

        const managedConnection = new ManagedConnection(localPeerDescriptor!,
            ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
        managedConnection.setPeerDescriptor(remotePeerDescriptor!)

        const onDisconnected = () => {
            reject(new FailedToConnectToStreamrWebSocket('Autocertifier failed to connect to '
                + address + '. Please chack that the IP address is not behind a NAT.'))
        }

        socket.on('disconnected', onDisconnected)

        managedConnection.on('handshakeCompleted', () => {
            socket.off('disconnected', onDisconnected)
            const communicator = new RoutingRpcCommunicator(AUTOCERTIFIER_SERVICE_ID,
                (msg: Message, _doNotConnect?: boolean): Promise<void> => {
                    logger.info('sending message to peer')
                    return managedConnection.send(Message.toBinary(msg), true)
                })
            managedConnection.on('managedData', (msg: Uint8Array) => {
                communicator.handleMessageFromPeer(Message.fromBinary(msg))
            })
            const rpcClient = toProtoRpcClient(new AutoCertifierRpcClient(communicator.getRpcClientTransport()))
            rpcClient.getSessionId({ sessionId: sessionId }).then(() => {
                resolve()
                return
            }).catch((e) => {
                reject(e)
            })
        })
        socket.connect(address, true)
    })
}
