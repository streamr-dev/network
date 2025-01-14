import {
    HandshakeError,
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebrtcConnectionRequest
} from '../../../generated/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { NodeWebrtcConnection } from './NodeWebrtcConnection'
import { WebrtcConnectorRpcRemote } from './WebrtcConnectorRpcRemote'
import { WebrtcConnectorRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { PortRange } from '../ConnectionManager'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { WebrtcConnectorRpcLocal } from './WebrtcConnectorRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, toNodeId } from '../../identifiers'
import { getOfferer } from '../../helpers/offering'
import { acceptHandshake, createIncomingHandshaker, createOutgoingHandshaker, rejectHandshake } from '../Handshaker'
import { isMaybeSupportedProtocolVersion } from '../../helpers/version'
import { PendingConnection } from '../PendingConnection'

const logger = new Logger(module)

export const replaceInternalIpWithExternalIp = (candidate: string, ip: string): string => {
    const parsed = candidate.split(' ')
    const type = parsed[7]
    if (type === 'host') {
        parsed[4] = ip
    }
    return parsed.join(' ')
}

export const EARLY_TIMEOUT = 5000

export interface WebrtcConnectorOptions {
    onNewConnection: (connection: PendingConnection) => boolean
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
    managedConnection: PendingConnection
    connection: NodeWebrtcConnection
}

export class WebrtcConnector {
    private static readonly WEBRTC_CONNECTOR_SERVICE_ID = 'system/webrtc-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly ongoingConnectAttempts: Map<DhtAddress, ConnectingConnection> = new Map()
    private localPeerDescriptor?: PeerDescriptor
    private stopped = false
    private options: WebrtcConnectorOptions

    constructor(options: WebrtcConnectorOptions) {
        this.options = options
        this.rpcCommunicator = new ListeningRpcCommunicator(
            WebrtcConnector.WEBRTC_CONNECTOR_SERVICE_ID,
            options.transport,
            {
                rpcRequestTimeout: 15000 // TODO use options option or named constant?
            }
        )
        this.registerLocalRpcMethods(options)
    }

    private registerLocalRpcMethods(options: WebrtcConnectorOptions) {
        const localRpc = new WebrtcConnectorRpcLocal({
            connect: (targetPeerDescriptor: PeerDescriptor, doNotRequestConnection: boolean) =>
                this.connect(targetPeerDescriptor, doNotRequestConnection),
            onNewConnection: (connection: PendingConnection) => this.options.onNewConnection(connection),
            ongoingConnectAttempts: this.ongoingConnectAttempts,
            rpcCommunicator: this.rpcCommunicator,
            getLocalPeerDescriptor: () => this.localPeerDescriptor!,
            allowPrivateAddresses: options.allowPrivateAddresses ?? true
        })
        this.rpcCommunicator.registerRpcNotification(
            WebrtcConnectionRequest,
            'requestConnection',
            async (_req: WebrtcConnectionRequest, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.requestConnection(context)
                } else {
                    return {}
                }
            }
        )
        this.rpcCommunicator.registerRpcNotification(
            RtcOffer,
            'rtcOffer',
            async (req: RtcOffer, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.rtcOffer(req, context)
                } else {
                    return {}
                }
            }
        )
        this.rpcCommunicator.registerRpcNotification(
            RtcAnswer,
            'rtcAnswer',
            async (req: RtcAnswer, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.rtcAnswer(req, context)
                } else {
                    return {}
                }
            }
        )
        this.rpcCommunicator.registerRpcNotification(
            IceCandidate,
            'iceCandidate',
            async (req: IceCandidate, context: ServerCallContext) => {
                if (!this.stopped) {
                    return localRpc.iceCandidate(req, context)
                } else {
                    return {}
                }
            }
        )
    }

    connect(targetPeerDescriptor: PeerDescriptor, doNotRequestConnection: boolean): PendingConnection {
        if (areEqualPeerDescriptors(targetPeerDescriptor, this.localPeerDescriptor!)) {
            throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
        }

        logger.trace(`Opening WebRTC connection to ${toNodeId(targetPeerDescriptor)}`)

        const nodeId = toNodeId(targetPeerDescriptor)
        const existingConnection = this.ongoingConnectAttempts.get(nodeId)
        if (existingConnection) {
            return existingConnection.managedConnection
        }

        const connection = this.createConnection(targetPeerDescriptor)

        const localNodeId = toNodeId(this.localPeerDescriptor!)
        const targetNodeId = toNodeId(targetPeerDescriptor)
        const offering = getOfferer(localNodeId, targetNodeId) === 'local'
        let pendingConnection: PendingConnection
        const remoteConnector = new WebrtcConnectorRpcRemote(
            this.localPeerDescriptor!,
            targetPeerDescriptor,
            this.rpcCommunicator,
            WebrtcConnectorRpcClient
        )
        const delFunc = () => {
            this.ongoingConnectAttempts.delete(nodeId)
            connection.off('disconnected', delFunc)
            pendingConnection.off('disconnected', delFunc)
            pendingConnection.off('connected', delFunc)
        }
        if (offering) {
            pendingConnection = new PendingConnection(targetPeerDescriptor)
            createOutgoingHandshaker(this.localPeerDescriptor!, pendingConnection, connection, targetPeerDescriptor)
            connection.once('localDescription', (description: string) => {
                logger.trace('Sending offer to remote peer')
                remoteConnector.sendRtcOffer(description, connection.connectionId)
            })
        } else {
            pendingConnection = new PendingConnection(targetPeerDescriptor)
            const handshaker = createIncomingHandshaker(this.localPeerDescriptor!, pendingConnection, connection)
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcAnswer(description, connection.connectionId)
            })
            handshaker.on('handshakeRequest', (_sourceDescriptor: PeerDescriptor, remoteVersion: string) => {
                if (!isMaybeSupportedProtocolVersion(remoteVersion)) {
                    rejectHandshake(
                        pendingConnection!,
                        connection,
                        handshaker,
                        HandshakeError.UNSUPPORTED_PROTOCOL_VERSION
                    )
                } else {
                    acceptHandshake(handshaker, pendingConnection, connection)
                }
                delFunc()
            })
        }

        this.ongoingConnectAttempts.set(targetNodeId, {
            managedConnection: pendingConnection,
            connection
        })

        connection.on('disconnected', delFunc)
        pendingConnection.on('disconnected', delFunc)
        pendingConnection.on('connected', delFunc)

        connection.on('localCandidate', (candidate: string, mid: string) => {
            if (this.options.externalIp !== undefined) {
                candidate = replaceInternalIpWithExternalIp(candidate, this.options.externalIp)
                logger.debug(`onLocalCandidate injected external ip ${candidate} ${mid}`)
            }
            remoteConnector.sendIceCandidate(candidate, mid, connection.connectionId)
        })

        connection.start(offering)

        if (!doNotRequestConnection && !offering) {
            remoteConnector.requestConnection()
        }

        return pendingConnection
    }

    private createConnection(targetPeerDescriptor: PeerDescriptor): NodeWebrtcConnection {
        return new NodeWebrtcConnection({
            remotePeerDescriptor: targetPeerDescriptor,
            iceServers: this.options.iceServers,
            bufferThresholdLow: this.options.bufferThresholdLow,
            bufferThresholdHigh: this.options.bufferThresholdHigh,
            portRange: this.options.portRange
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
        await Promise.allSettled(
            attempts.map(async (conn) => {
                conn.connection.destroy()
                conn.managedConnection.close(false)
            })
        )

        this.rpcCommunicator.destroy()
    }
}
