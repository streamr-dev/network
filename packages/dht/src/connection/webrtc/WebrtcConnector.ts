import {
    HandshakeError,
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer, WebrtcConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { NodeWebrtcConnection } from './NodeWebrtcConnection'
import { WebrtcConnectorRpcRemote } from './WebrtcConnectorRpcRemote'
import { WebrtcConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ManagedConnection } from '../ManagedConnection'
import { PortRange } from '../ConnectionManager'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { WebrtcConnectorRpcLocal } from './WebrtcConnectorRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { getOfferer } from '../../helpers/offering'
import { acceptHandshake, createIncomingHandshaker, createOutgoingHandshaker, rejectHandshake } from '../Handshaker'
import { ConnectionType, IConnection } from '../IConnection'
import { isMaybeSupportedVersion } from '../../helpers/version'

const logger = new Logger(module)

export const replaceInternalIpWithExternalIp = (candidate: string, ip: string): string => {
    const parsed = candidate.split(' ')
    const type = parsed[7]
    if (type === 'host') {
        parsed[4] = ip
    }
    return parsed.join(' ')
}

export interface WebrtcConnectorConfig {
    onNewConnection: (connection: ManagedConnection) => boolean
    onHandshakeCompleted: (peerDescriptor: PeerDescriptor, connection: IConnection) => void
    transport: ITransport
    iceServers?: IceServer[]
    allowPrivateAddresses?: boolean
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    maxMessageSize?: number
    externalIp?: string
    portRange?: PortRange
}

export interface IceServer {
    url: string
    port: number
    username?: string
    password?: string
    tcp?: boolean
}

export interface ConnectingConnection {
    managedConnection: ManagedConnection
    connection: NodeWebrtcConnection
}

export class WebrtcConnector {

    private static readonly WEBRTC_CONNECTOR_SERVICE_ID = 'system/webrtc-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly ongoingConnectAttempts: Map<DhtAddress, ConnectingConnection> = new Map()
    private localPeerDescriptor?: PeerDescriptor
    private stopped = false
    private config: WebrtcConnectorConfig

    constructor(config: WebrtcConnectorConfig) {
        this.config = config
        this.rpcCommunicator = new ListeningRpcCommunicator(WebrtcConnector.WEBRTC_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
        this.registerLocalRpcMethods(config)
    }

    private registerLocalRpcMethods(config: WebrtcConnectorConfig) {
        const localRpc = new WebrtcConnectorRpcLocal({
            connect: (targetPeerDescriptor: PeerDescriptor, doNotRequestConnection: boolean) => 
                this.connect(targetPeerDescriptor, doNotRequestConnection),
            onNewConnection: (connection: ManagedConnection) => this.config.onNewConnection(connection),
            ongoingConnectAttempts: this.ongoingConnectAttempts,
            rpcCommunicator: this.rpcCommunicator,
            getLocalPeerDescriptor: () => this.localPeerDescriptor!,
            allowPrivateAddresses: config.allowPrivateAddresses ?? true
        })
        this.rpcCommunicator.registerRpcNotification(WebrtcConnectionRequest, 'requestConnection',
            async (_req: WebrtcConnectionRequest, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.requestConnection(context)
                } else {
                    return {}
                }
            }
        )
        this.rpcCommunicator.registerRpcNotification(RtcOffer, 'rtcOffer',
            async (req: RtcOffer, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.rtcOffer(req, context)
                } else {
                    return {}
                }
            }
        )
        this.rpcCommunicator.registerRpcNotification(RtcAnswer, 'rtcAnswer',
            async (req: RtcAnswer, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.rtcAnswer(req, context)
                } else {
                    return {}
                }
            }
        )
        this.rpcCommunicator.registerRpcNotification(IceCandidate, 'iceCandidate',
            async (req: IceCandidate, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.iceCandidate(req, context)
                } else {
                    return {}
                }
            }
        )
    }

    connect(targetPeerDescriptor: PeerDescriptor, doNotRequestConnection: boolean): ManagedConnection {
        if (areEqualPeerDescriptors(targetPeerDescriptor, this.localPeerDescriptor!)) {
            throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
        }

        logger.trace(`Opening WebRTC connection to ${getNodeIdFromPeerDescriptor(targetPeerDescriptor)}`)

        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.ongoingConnectAttempts.get(nodeId)
        if (existingConnection) {
            return existingConnection.managedConnection
        }

        const connection = this.createConnection(targetPeerDescriptor)

        const localNodeId = getNodeIdFromPeerDescriptor(this.localPeerDescriptor!)
        const targetNodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const offering = (getOfferer(localNodeId, targetNodeId) === 'local')
        let managedConnection: ManagedConnection
        const remoteConnector = new WebrtcConnectorRpcRemote(
            this.localPeerDescriptor!,
            targetPeerDescriptor,
            this.rpcCommunicator,
            WebrtcConnectorRpcClient
        )
        const delFunc = () => {
            this.ongoingConnectAttempts.delete(nodeId)
            connection.off('disconnected', delFunc)
            managedConnection.off('disconnected', delFunc)
            managedConnection.off('connected', delFunc)
        }
        if (offering) {
            managedConnection = new ManagedConnection(ConnectionType.WEBRTC)
            createOutgoingHandshaker(this.localPeerDescriptor!, managedConnection, connection, this.config.onHandshakeCompleted, targetPeerDescriptor)
            connection.once('localDescription', (description: string) => {
                logger.trace('Sending offer to remote peer')
                remoteConnector.sendRtcOffer(description, connection.connectionId)
            })
        } else {
            managedConnection = new ManagedConnection(ConnectionType.WEBRTC)
            const handshaker = createIncomingHandshaker(this.localPeerDescriptor!, managedConnection, connection)
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcAnswer(description, connection.connectionId)
            })
            handshaker.on('handshakeRequest', (sourceDescriptor: PeerDescriptor, remoteVersion: string) => {
                if (!isMaybeSupportedVersion(remoteVersion)) {
                    rejectHandshake(managedConnection!, connection, handshaker, HandshakeError.UNSUPPORTED_VERSION)
                } else {
                    acceptHandshake(handshaker)
                    this.config.onHandshakeCompleted(sourceDescriptor, connection)
                }
                delFunc()
            })
        }

        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)

        this.ongoingConnectAttempts.set(targetNodeId, {
            managedConnection,
            connection
        })

        connection.on('disconnected', delFunc)
        managedConnection.on('disconnected', delFunc)
        managedConnection.on('connected', delFunc)
    
        connection.on('localCandidate', (candidate: string, mid: string) => {
            if (this.config.externalIp !== undefined) {
                candidate = replaceInternalIpWithExternalIp(candidate, this.config.externalIp)
                logger.debug(`onLocalCandidate injected external ip ${candidate} ${mid}`)
            }
            remoteConnector.sendIceCandidate(candidate, mid, connection.connectionId)
        })

        connection.start(offering)

        if (!doNotRequestConnection && !offering) {
            remoteConnector.requestConnection()
        }

        return managedConnection
    }

    private createConnection(targetPeerDescriptor: PeerDescriptor): NodeWebrtcConnection {
        return new NodeWebrtcConnection({
            remotePeerDescriptor: targetPeerDescriptor,
            iceServers: this.config.iceServers,
            bufferThresholdLow: this.config.bufferThresholdLow,
            bufferThresholdHigh: this.config.bufferThresholdHigh,
            portRange: this.config.portRange
            // TODO should we pass maxMessageSize?
        })
    }

    setLocalPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = peerDescriptor
    }

    public async stop(): Promise<void> {
        logger.trace('stop()')
        this.stopped = true

        const attempts = Array.from(this.ongoingConnectAttempts.values())
        await Promise.allSettled(attempts.map(async (conn) => {
            conn.connection.destroy()
            await conn.managedConnection.close(false)
        }))

        this.rpcCommunicator.destroy()
    }
}
