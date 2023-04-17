//import WebSocket from 'ws'
import { PeerId, PeerInfo } from '../connection/PeerInfo'
import { AbstractWsEndpoint, DisconnectionCode, DisconnectionReason } from '../connection/ws/AbstractWsEndpoint'
import { AbstractWsConnection, ReadyState } from '../connection/ws/AbstractWsConnection'
import { Simulator, cleanAddress } from './Simulator'
import { v4 } from 'uuid'
import WebSocket from 'ws'
import { Logger } from '@streamr/utils'

export type ServerUrl = string
//export type SupportedWs = WebSocket | w3cwebsocket
export interface HandshakeValues { uuid: string, peerId: PeerId }

/*
export interface WebSocketConnectionFactory<C extends AbstractWsConnection> {
    createConnection(peerInfo: PeerInfo): C
}
*/

const logger = new Logger(module)

export abstract class AbstractClientWsEndpoint<C extends AbstractWsConnection> extends AbstractWsEndpoint<C> {
    protected readonly connectionsByServerUrl: Map<ServerUrl, C>
    protected readonly serverUrlByPeerId: Map<PeerId, ServerUrl>
    protected readonly pendingConnections: Map<ServerUrl, Promise<PeerId>>

    protected ownAddress: string

    constructor(
        peerInfo: PeerInfo,
        pingInterval: number
    ) {
        super(peerInfo, pingInterval)

        this.ownAddress = v4()
        this.connectionsByServerUrl = new Map()
        this.serverUrlByPeerId = new Map()
        this.pendingConnections = new Map()
    }

    getServerUrlByPeerId(peerId: PeerId): string | undefined {
        return this.serverUrlByPeerId.get(peerId)
    }

    protected doClose(connection: C, _code: DisconnectionCode, _reason: DisconnectionReason): void {
        const serverUrl = this.serverUrlByPeerId.get(connection.getPeerId())!
        this.connectionsByServerUrl.delete(serverUrl)
        this.serverUrlByPeerId.delete(connection.getPeerId())
    }

    protected async doStop(): Promise<void> {
        this.getConnections().forEach((connection) => {
            connection.close(DisconnectionCode.GRACEFUL_SHUTDOWN, DisconnectionReason.GRACEFUL_SHUTDOWN)
        })
    }

    connect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId> {
        // Check for existing connection and its state
        serverUrl = cleanAddress(serverUrl)

        const existingConnection = this.connectionsByServerUrl.get(serverUrl)
        
        if (existingConnection !== undefined) {
            if (existingConnection.getReadyState() === 1 as ReadyState) {
                return Promise.resolve(existingConnection.getPeerId())
            }
            logger.trace(`supposedly connected to ${serverUrl} but readyState is ${existingConnection.getReadyState()}, closing connection`)
            this.close(
                existingConnection.getPeerId(),
                DisconnectionCode.DEAD_CONNECTION,
                DisconnectionReason.DEAD_CONNECTION
            )
        }

        // Check for pending connection
        const pendingConnection = this.pendingConnections.get(serverUrl)
        if (pendingConnection !== undefined) {
            return pendingConnection
        }

        // Perform connection
        logger.trace(`connecting to ${serverUrl}`)
        const p = this.doConnect(serverUrl, serverPeerInfo).then((peerId) => {
            if (this.connectionsByServerUrl.get(serverUrl)) {
                this.onNewConnection(this.connectionsByServerUrl.get(serverUrl)!)
                return peerId
            } else {
                return peerId
                //throw new Error('Connection failed')
            }

        }).finally(() => {
            this.pendingConnections.delete(serverUrl)
        })

        this.pendingConnections.set(serverUrl, p)
        return p
    }

    /**
     * Custom connect logic of subclass
     */
    protected abstract doConnect(serverUrl: ServerUrl, serverPeerInfo: PeerInfo): Promise<PeerId>

    /**
     * Init client-side handshake timeout
     */
    protected handshakeInit(serverAddress: string, serverPeerInfo: PeerInfo, reject: (reason?: any) => void
    ): void {
        const peerId = serverPeerInfo.peerId
        this.handshakeTimeoutRefs[peerId] = setTimeout(() => {
            
            //ws.close(DisconnectionCode.FAILED_HANDSHAKE, `Handshake not received from ${peerId}`)
            
            Simulator.instance().wsDisconnect(this.ownAddress, this.peerInfo, serverAddress, DisconnectionCode.FAILED_HANDSHAKE, 
                `Handshake not received from ${peerId}` )
            logger.warn(`Client: Handshake not received from ${peerId}`)
            delete this.handshakeTimeoutRefs[peerId]
            reject(`Handshake not received from ${peerId}`)
        }, this.handshakeTimer)
    }

    /**
     * Initial handshake message listener
     */
    protected handshakeListener(
        serverPeerInfo: PeerInfo,
        serverUrl: string,
        message: WebSocket.RawData,
        resolve: (value: PeerId | PromiseLike<string>) => void
    ): void {
        try {
            const { uuid, peerId } = this.doHandshakeParse(message)
            if (uuid && peerId === serverPeerInfo.peerId) {
                this.clearHandshake(peerId)
                const id = this.setUpConnection(serverPeerInfo, serverUrl)
                this.doHandshakeResponse(uuid, peerId, serverUrl)
                resolve(id)
            } else {
                logger.trace('Expected a handshake message got: ' + message)
            }
        } catch (err) {
            logger.trace(err)
        }
    }

    // eslint-disable-next-line class-methods-use-this
    protected onHandshakeError(serverUrl: string, error: Error, reject: (reason?: any) => void): void {
        logger.trace(`failed to connect to ${serverUrl}, error: ${error}`)
        reject(error)
    }

    // eslint-disable-next-line class-methods-use-this
    protected onHandshakeClosed(serverUrl: string, code: number, reason: string, reject: (reason?: any) => void): void {
        logger.trace(`Connection to ${serverUrl} closed during handshake with code: ${code}, reason ${reason}`)
        reject(reason)
    }

    // eslint-disable-next-line class-methods-use-this
    protected ongoingConnectionError(serverPeerId: PeerId, error: Error, connection: AbstractWsConnection): void {
        logger.trace(`Connection to ${serverPeerId} failed, error: ${error}`)
        connection.terminate()
    }

    /**
     * Send a handshake response back to the server
     */
    protected abstract doHandshakeResponse(uuid: string, peerId: PeerId, serverAddress: string): void

    /**
     * Parse handshake message
     */
    protected abstract doHandshakeParse(message: WebSocket.RawData): HandshakeValues

    /**
     * Finalise WS connection e.g. add final event listeners
     */
    protected abstract doSetUpConnection(serverPeerInfo: PeerInfo, serverAddress: string): C

    private setUpConnection(serverPeerInfo: PeerInfo, serverUrl: ServerUrl): PeerId {
        const connection = this.doSetUpConnection(serverPeerInfo, serverUrl)

        this.connectionsByServerUrl.set(serverUrl, connection)
        
        // @ts-expect-error private field
        this.connectionById.set(connection.getPeerId(), connection)
        this.serverUrlByPeerId.set(connection.getPeerId(), serverUrl)
        
        return connection.getPeerId()
    }
}
