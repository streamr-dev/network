import { PeerId, PeerInfo } from '../connection/PeerInfo'
import { DisconnectionCode, DisconnectionReason } from '../connection/ws/AbstractWsEndpoint'
import { NodeClientWsConnection } from './NodeClientWsConnection_simulator'
import { AbstractClientWsEndpoint, HandshakeValues, ServerUrl } from './AbstractClientWsEndpoint_simulator'
import { ISimulatedWsEndpoint } from './ISimulatedWsEndpoint'
import { Simulator } from './Simulator'

export default class NodeClientWsEndpoint extends AbstractClientWsEndpoint<NodeClientWsConnection> implements ISimulatedWsEndpoint {

    private pendingHandshakes: {
        [peerId: string]: [resolve: (value: PeerId | PromiseLike<string>) => void,
            reject: (value: PeerId | PromiseLike<string>) => void, serverPeerInfo: PeerInfo]
    } = {}

    constructor(
        peerInfo: PeerInfo,
        pingInterval?: number
    ) {
        super(peerInfo, pingInterval)
        Simulator.instance().addClientWsEndpoint(peerInfo, this.ownAddress, this)
    }

    protected doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId> {
        return new Promise<PeerId>((resolve, reject) => {
            try {
                this.pendingHandshakes[serverPeerInfo.peerId] = [resolve, reject, serverPeerInfo]
                this.handshakeInit(serverUrl, serverPeerInfo, reject)
                Simulator.instance().wsConnect(this.ownAddress, this.peerInfo, serverUrl as string)

            } catch (err) {
                this.logger.trace('failed to connect to %s, error: %o', serverUrl, err)
                reject(err)
            }
        })
    }

    doOnClose(connection: NodeClientWsConnection, code: DisconnectionCode, reason: DisconnectionReason | string): void {
        this.onClose(connection, code, reason as DisconnectionReason)
    }
    
    protected doSetUpConnection(serverPeerInfo: PeerInfo, serverAddress: string): NodeClientWsConnection {
        const connection = this.newConnection(serverAddress, serverPeerInfo)
        return connection
    }

    private newConnection = (serverAddress: string, serverPeerInfo: PeerInfo) => {
        return new NodeClientWsConnection(this.ownAddress, this.peerInfo, serverAddress, serverPeerInfo, this)
    }

    protected doHandshakeResponse(uuid: string, peerId: PeerId, serverAddress: string): void {
        delete this.pendingHandshakes[peerId]
        Simulator.instance().wsSend(this.ownAddress, this.peerInfo, serverAddress, JSON.stringify({ uuid, peerId: this.peerInfo.peerId }))
        //ws.send(JSON.stringify({ uuid, peerId: this.peerInfo.peerId }))
    }

    protected doHandshakeParse(message: string | Buffer | Buffer[]): HandshakeValues {
        const { uuid, peerId } = JSON.parse(message.toString())
        return {
            uuid,
            peerId
        }
    }

    /****************** Called by Simulator ************/

    //not implemented in client socket
    public handleIncomingConnection(_ufromAddress: string, _ufromInfo: PeerInfo): void { }

    public handleIncomingDisconnection(_ufromAddress: string, fromInfo: PeerInfo, code: DisconnectionCode, 
        reason: DisconnectionReason | string): void {

        if (this.pendingHandshakes.hasOwnProperty(fromInfo.peerId)) {
            this.onHandshakeClosed(this.getServerUrlByPeerId(fromInfo.peerId) as string, code, reason, this.pendingHandshakes[fromInfo.peerId][1])
            delete this.pendingHandshakes[fromInfo.peerId]
        }

        else {
            const connection = this.getConnectionByPeerId(fromInfo.peerId) as NodeClientWsConnection
            if (connection) {
                this.onClose(connection, code, reason as DisconnectionReason)
                if (code === DisconnectionCode.DUPLICATE_SOCKET) {
                    this.logger.warn('Connection refused: Duplicate nodeId detected, are you running multiple nodes with the same private key?')
                }
            }
        }
    }

    public async handleIncomingMessage(fromAddress: string, fromInfo: PeerInfo, data: string): Promise<void> {
        const connection = this.getConnectionByPeerId(fromInfo.peerId) as NodeClientWsConnection
        const parsed = data.toString()
        if (parsed === 'ping') {
            await this.send(fromInfo.peerId, 'pong')
        }
        else if (parsed === 'pong') {
            connection.onPong()
        }

        else if (this.pendingHandshakes.hasOwnProperty(fromInfo.peerId)) {
            try {
                const { uuid, peerId } = JSON.parse(parsed)

                if (uuid && peerId && this.pendingHandshakes.hasOwnProperty(fromInfo.peerId)) {
                    this.handshakeListener(this.pendingHandshakes[fromInfo.peerId][2], fromAddress, data, this.pendingHandshakes[fromInfo.peerId][0])
                }

                else {
                    this.onReceive(connection, data)
                }

            } catch (err) {
                this.logger.trace(err)
                this.onReceive(connection, data)
            }
        }
        else {
            this.onReceive(connection, data)
        }
    }
}