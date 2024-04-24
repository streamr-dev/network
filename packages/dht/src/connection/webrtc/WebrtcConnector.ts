import {
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
import { ManagedWebrtcConnection } from './ManagedWebrtcConnection'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ManagedConnection } from '../ManagedConnection'
import { PortRange } from '../ConnectionManager'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { WebrtcConnectorRpcLocal } from './WebrtcConnectorRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../identifiers'
import { getOfferer } from '../../helpers/offering'

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
    transport: ITransport
    iceServers?: IceServer[]
    allowPrivateAddresses?: boolean
    bufferThresholdLow?: number
    bufferThresholdHigh?: number
    maxMessageSize?: number
    connectionTimeout?: number
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

export class WebrtcConnector {

    private static readonly WEBRTC_CONNECTOR_SERVICE_ID = 'system/webrtc-connector'
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly ongoingConnectAttempts: Map<DhtAddress, ManagedWebrtcConnection> = new Map()
    private localPeerDescriptor?: PeerDescriptor
    private stopped = false
    private config: WebrtcConnectorConfig

    constructor(
        config: WebrtcConnectorConfig,
        onNewConnection: (connection: ManagedConnection) => boolean
    ) {
        this.config = config
        this.rpcCommunicator = new ListeningRpcCommunicator(WebrtcConnector.WEBRTC_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
        this.registerLocalRpcMethods(config, onNewConnection)
    }

    private registerLocalRpcMethods(
        config: WebrtcConnectorConfig,
        onNewConnection: (connection: ManagedConnection) => boolean
    ) {
        const localRpc = new WebrtcConnectorRpcLocal({
            createConnection: (targetPeerDescriptor: PeerDescriptor) => this.createConnection(targetPeerDescriptor),
            connect: (targetPeerDescriptor: PeerDescriptor) => this.connect(targetPeerDescriptor),
            onNewConnection,
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

    connect(targetPeerDescriptor: PeerDescriptor): ManagedConnection {
        if (areEqualPeerDescriptors(targetPeerDescriptor, this.localPeerDescriptor!)) {
            throw new Err.CannotConnectToSelf('Cannot open WebRTC Connection to self')
        }

        logger.trace(`Opening WebRTC connection to ${getNodeIdFromPeerDescriptor(targetPeerDescriptor)}`)

        const nodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.ongoingConnectAttempts.get(nodeId)
        if (existingConnection) {
            return existingConnection
        }

        const connection = this.createConnection(targetPeerDescriptor)

        const localNodeId = getNodeIdFromPeerDescriptor(this.localPeerDescriptor!)
        const targetNodeId = getNodeIdFromPeerDescriptor(targetPeerDescriptor)
        const offering = (getOfferer(localNodeId, targetNodeId) === 'local')
        let managedConnection: ManagedWebrtcConnection

        if (offering) {
            managedConnection = new ManagedWebrtcConnection(this.localPeerDescriptor!, connection)
        } else {
            managedConnection = new ManagedWebrtcConnection(this.localPeerDescriptor!, undefined, connection)
        }

        managedConnection.setRemotePeerDescriptor(targetPeerDescriptor)

        this.ongoingConnectAttempts.set(targetNodeId, managedConnection)

        const delFunc = () => {
            this.ongoingConnectAttempts.delete(nodeId)
            connection.off('disconnected', delFunc)
            managedConnection.off('handshakeCompleted', delFunc)
        }
        connection.on('disconnected', delFunc)
        managedConnection.on('handshakeCompleted', delFunc)

        const remoteConnector = new WebrtcConnectorRpcRemote(
            this.localPeerDescriptor!,
            targetPeerDescriptor,
            this.rpcCommunicator,
            WebrtcConnectorRpcClient
        )

        connection.on('localCandidate', (candidate: string, mid: string) => {
            if (this.config.externalIp !== undefined) {
                candidate = replaceInternalIpWithExternalIp(candidate, this.config.externalIp)
                logger.debug(`onLocalCandidate injected external ip ${candidate} ${mid}`)
            }
            remoteConnector.sendIceCandidate(candidate, mid, connection.connectionId)
        })

        if (offering) {
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcOffer(description, connection.connectionId)
            })
        } else {
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcAnswer(description, connection.connectionId)
            })
        }

        connection.start(offering)

        if (!offering) {
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
            connectingTimeout: this.config.connectionTimeout,
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
        await Promise.allSettled(attempts.map((conn) => conn.close(false)))

        this.rpcCommunicator.destroy()
    }
}
