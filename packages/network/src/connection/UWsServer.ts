// this class emits new UWsConnections

import EventEmitter from "events"
import { Logger } from '../helpers/Logger'
import { UWsConnection } from "./UWsConnection"
import uWS from 'uWebSockets.js'
import { PeerInfo, PeerType } from "./PeerInfo"
import StrictEventEmitter from 'strict-event-emitter-types'
import { WebSocketConnection } from "./WebSocketConnection"
import { DisconnectionCode } from "./IWsEndpoint"
import { DeferredConnectionAttempt } from "./DeferredConnectionAttempt"

interface UserData {
	// upgraded vars
	address: string
	peerId?: string
	peerType?: PeerType
	controlLayerVersions?: string
	messageLayerVersions?: string

	peerInfo: PeerInfo
	highBackPressure: boolean
	respondedPong?: boolean
	rttStart?: number
	rtt?: number
}

interface ExtendedUws extends uWS.WebSocket, UserData { }

/**
 * Strict types for EventEmitter interface.
 */
interface Events {
	newConnection: (connection: WebSocketConnection) => void
}

// reminder: only use Connection emitter for external handlers
// to make it safe for consumers to call removeAllListeners
// i.e. no this.on('event')
export const ConnectionEmitter = EventEmitter as { new(): StrictEventEmitter<EventEmitter, Events> }

export class UWsServer extends ConnectionEmitter {

	private logger: Logger
	private listenSocket: uWS.us_listen_socket | null
	private wss: uWS.TemplatedApp | null = null
	private readonly connections: Map<string, UWsConnection>

	constructor(
		private selfPeerInfo: PeerInfo,
		private selfAddress: string,
		private selfHost: string,
		private selfPort: number,
		private privateKeyFileName: string | undefined = undefined,
		private certFileName: string | undefined = undefined,
		private wsBufferSize: number) {

	    super()

	    this.listenSocket = null
	    this.logger = new Logger(module)
	    this.connections = new Map<string, UWsConnection>()
	}

	private startWebSocketServer(
	    host: string | null,
	    port: number,
	    privateKeyFileName: string | undefined = undefined,
	    certFileName: string | undefined = undefined
	): Promise<[uWS.TemplatedApp, uWS.us_listen_socket]> {
	    return new Promise((resolve, reject) => {
	        let server: uWS.TemplatedApp
	        if (privateKeyFileName && certFileName) {
	            this.logger.trace(`starting SSL uWS server (host: ${host}, port: ${port}, using ${privateKeyFileName}, ${certFileName}`)
	            server = uWS.SSLApp({
	                key_file_name: privateKeyFileName,
	                cert_file_name: certFileName,
	            })
	        } else {
	            this.logger.trace(`starting non-SSL uWS (host: ${host}, port: ${port}`)
	            server = uWS.App()
	        }

	        const cb = (listenSocket: uWS.us_listen_socket): void => {
	            if (listenSocket) {
	                resolve([server, listenSocket])
	            } else {
	                reject(new Error(`Failed to start websocket server, host ${host}, port ${port}`))
	            }
	        }

	        if (host) {
	            server.listen(host, port, cb)
	        } else {
	            server.listen(port, cb)
	        }
	    })
	}

	getWss(): uWS.TemplatedApp | null {
	    return this.wss
	}

	async start(): Promise<void> {

	    const [wss, socket] = await this.startWebSocketServer(this.selfHost, this.selfPort, this.privateKeyFileName, this.certFileName)
	    this.listenSocket = socket
	    this.wss = wss

	    wss.ws('/ws', {
	        compression: 0,
	        maxPayloadLength: 1024 * 1024,
	        maxBackpressure: this.wsBufferSize,
	        idleTimeout: 0,

	        upgrade: (res, req, context) => {
	            res.writeStatus('101 Switching Protocols')
	                .writeHeader('streamr-peer-id', this.selfPeerInfo.peerId)
	                .writeHeader('streamr-peer-type', this.selfPeerInfo.peerType)
	                .writeHeader('control-layer-versions', this.selfPeerInfo.controlLayerVersions.join(','))
	                .writeHeader('message-layer-versions', this.selfPeerInfo.messageLayerVersions.join(','))

	            /* This immediately calls open handler, you must not use res after this call */
	            res.upgrade({
	                address: req.getQuery('address'),
	                peerId: req.getHeader('streamr-peer-id'),
	                peerType: req.getHeader('streamr-peer-type'),
	                controlLayerVersions: req.getHeader('control-layer-versions'),
	                messageLayerVersions: req.getHeader('message-layer-versions')
	            },
	            /* Spell these correctly */
	            req.getHeader('sec-websocket-key'),
	            req.getHeader('sec-websocket-protocol'),
	            req.getHeader('sec-websocket-extensions'),
	            context)
	        },

	        open: (ws) => {
	            this.onIncomingConnection(ws as ExtendedUws)
	        },

	        message: (ws, message, _isBinary) => {
	            const connection = this.connections.get(ws.address)

	            if (connection) {
	                connection.handleMessage(message, _isBinary)
	            }
	        },

	        drain: (ws) => {
	            const connection = this.connections.get(ws.address)

	            if (connection) {
	                connection.handleDrain()
	            }
	        },

	        close: (ws, code, message) => {
	            const connection = this.connections.get(ws.address)

	            if (connection) {
	                connection.handleClose(code, message)
	            }
	        },
	        pong: (ws) => {
	            const connection = this.connections.get(ws.address)

	            if (connection) {
	                connection.handlePong()
	            }
	        }
	    })
	}

	stop(): void {
	    if (this.listenSocket) {
	        this.logger.trace('shutting down uWS server')
	        uWS.us_listen_socket_close(this.listenSocket)
	        this.listenSocket = null
	    }
	}

	private emitNewConnection(connection: WebSocketConnection) {
	    this.emit('newConnection', connection)
	}

	private onIncomingConnection(ws: ExtendedUws): void {
	    const { address, peerId, peerType, controlLayerVersions, messageLayerVersions } = ws

	    try {	
	        if (!peerId) {
	            throw new Error('peerId not given')
	        }
		
	        const clientPeerInfo = PeerInfo.newNode(peerId)  

	        this.logger.trace('<=== %s connecting to me', address)

	        const connection = new UWsConnection({
	            selfAddress: this.selfAddress,
	            selfPeerInfo: this.selfPeerInfo,
	            targetPeerAddress: address,
	            deferredConnectionAttempt: new DeferredConnectionAttempt(),
	        }, ws, clientPeerInfo)

	        this.connections.set(ws.address, connection)

	        connection.on('close', (code, reason) => {
	            if (this.connections.get(ws.address)) {
	                this.connections.delete(ws.address)
	            }
	        })

	        this.emitNewConnection(connection)
	    } catch (e) {
	        this.logger.trace('dropped incoming connection because of %s', e)
	        try {
	            ws.end(DisconnectionCode.MISSING_REQUIRED_PARAMETER, e.toString())
	        } catch (e) {
	            this.logger.error('failed to terminate ws, reason %s', e)
	        }
	    }
	}
}