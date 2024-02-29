import {
    Message,
    NodeType,
    PeerDescriptor,
    ClientWebsocket,
    ManagedConnection,
    RoutingRpcCommunicator,
    createRandomDhtAddress,
    getRawFromDhtAddress,
    ConnectionType
} from '@streamr/dht'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'
import { FailedToConnectToStreamrWebSocket, AutoCertifierRpcClient, SERVICE_ID } from '@streamr/autocertifier-client'

const logger = new Logger(module)

// This is a dummy peer descriptor that is used to connect to the streamr websocket
// To ensure that the autocertified subdomain is used for the Streamr Network
const LOCAL_PEER_DESCRIPTOR: PeerDescriptor = {
    nodeId: getRawFromDhtAddress(createRandomDhtAddress()),
    type: NodeType.NODEJS,
}

// TODO: use async/await
export const runStreamrChallenge = (
    streamrWebSocketIp: string,
    streamrWebSocketPort: string,
    sessionId: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const remotePeerDescriptor: PeerDescriptor = {
            nodeId: getRawFromDhtAddress(createRandomDhtAddress()),
            type: NodeType.NODEJS,
            websocket: {
                host: streamrWebSocketIp,
                port: parseInt(streamrWebSocketPort),
                tls: true
            }
        }
        const socket = new ClientWebsocket()
        const address = 'wss://' + remotePeerDescriptor.websocket!.host + ':' +
        remotePeerDescriptor.websocket!.port

        const managedConnection = new ManagedConnection(LOCAL_PEER_DESCRIPTOR,
            ConnectionType.WEBSOCKET_CLIENT, socket, undefined)
        managedConnection.setRemotePeerDescriptor(remotePeerDescriptor)

        const onDisconnected = () => {
            reject(new FailedToConnectToStreamrWebSocket('Autocertifier failed to connect to '
                + address + '. Please chack that the IP address is not behind a NAT.'))
        }

        socket.on('disconnected', onDisconnected)

        managedConnection.on('handshakeCompleted', () => {
            socket.off('disconnected', onDisconnected)
            const communicator = new RoutingRpcCommunicator(SERVICE_ID,
                (msg: Message): Promise<void> => {
                    logger.info('sending message to peer')
                    return managedConnection.send(Message.toBinary(msg), true)
                })
            managedConnection.on('managedData', (msg: Uint8Array) => {
                communicator.handleMessageFromPeer(Message.fromBinary(msg))
            })
            const rpcClient = toProtoRpcClient(new AutoCertifierRpcClient(communicator.getRpcClientTransport()))
            // eslint-disable-next-line promise/catch-or-return
            rpcClient.hasSession({ sessionId }).then(() => {
                resolve()
                return
            }).catch((e) => {
                reject(e)
            }).finally(() => {
                communicator.stop()
                // close with leave flag true just in case 
                // any info of the autocertifer is in the network
                managedConnection.close(true)
            })
        })

        // TODO: the 1st query by autocertifier-client will always be self-signed,
        // later queries may have a proper certificate
        socket.connect(address, true)
    })
}
