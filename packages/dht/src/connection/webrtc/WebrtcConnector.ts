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
import { PeerIDKey } from '../../helpers/PeerID'
import { ManagedWebrtcConnection } from '../ManagedWebrtcConnection'
import { Logger } from '@streamr/utils'
import * as Err from '../../helpers/errors'
import { ManagedConnection } from '../ManagedConnection'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import {
    areEqualPeerDescriptors,
    keyFromPeerDescriptor,
    peerIdFromPeerDescriptor
} from '../../helpers/peerIdFromPeerDescriptor'
import { PortRange } from '../ConnectionManager'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { WebrtcConnectorRpcLocal } from './WebrtcConnectorRpcLocal'

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
    private readonly ongoingConnectAttempts: Map<PeerIDKey, ManagedWebrtcConnection> = new Map()
    private localPeerDescriptor?: PeerDescriptor
    private stopped = false
    private iceServers: IceServer[]
    private config: WebrtcConnectorConfig

    constructor(
        config: WebrtcConnectorConfig,
        onIncomingConnection: (connection: ManagedConnection) => boolean
    ) {
        this.config = config
        this.iceServers = config.iceServers ?? []
        this.rpcCommunicator = new ListeningRpcCommunicator(WebrtcConnector.WEBRTC_CONNECTOR_SERVICE_ID, config.transport, {
            rpcRequestTimeout: 15000
        })
        this.registerLocalRpcMethods(config, onIncomingConnection)
    }

    private registerLocalRpcMethods(
        config: WebrtcConnectorConfig,
        onIncomingConnection: (connection: ManagedConnection) => boolean
    ) {
        const localRpc = new WebrtcConnectorRpcLocal({
            connect: (targetPeerDescriptor: PeerDescriptor) => this.connect(targetPeerDescriptor),
            onIncomingConnection,
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

        logger.trace(`Opening WebRTC connection to ${keyFromPeerDescriptor(targetPeerDescriptor)}`)

        const peerKey = keyFromPeerDescriptor(targetPeerDescriptor)
        const existingConnection = this.ongoingConnectAttempts.get(peerKey)
        if (existingConnection) {
            return existingConnection
        }

        const connection = new NodeWebrtcConnection({
            remotePeerDescriptor: targetPeerDescriptor,
            iceServers: this.iceServers,
            bufferThresholdLow: this.config.bufferThresholdLow,
            bufferThresholdHigh: this.config.bufferThresholdHigh,
            connectingTimeout: this.config.connectionTimeout,
            portRange: this.config.portRange
        })

        const offering = this.isOffering(targetPeerDescriptor)
        let managedConnection: ManagedWebrtcConnection

        if (offering) {
            managedConnection = new ManagedWebrtcConnection(this.localPeerDescriptor!, connection)
        } else {
            managedConnection = new ManagedWebrtcConnection(this.localPeerDescriptor!, undefined, connection)
        }

        managedConnection.setPeerDescriptor(targetPeerDescriptor)

        this.ongoingConnectAttempts.set(keyFromPeerDescriptor(targetPeerDescriptor), managedConnection)

        const delFunc = () => {
            this.ongoingConnectAttempts.delete(peerKey)
            connection.off('disconnected', delFunc)
            managedConnection.off('handshakeCompleted', delFunc)
        }
        connection.on('disconnected', delFunc)
        managedConnection.on('handshakeCompleted', delFunc)

        const remoteConnector = new WebrtcConnectorRpcRemote(
            this.localPeerDescriptor!,
            targetPeerDescriptor,
            toProtoRpcClient(new WebrtcConnectorRpcClient(this.rpcCommunicator.getRpcClientTransport()))
        )

        connection.on('localCandidate', (candidate: string, mid: string) => {
            if (this.config.externalIp) {
                candidate = replaceInternalIpWithExternalIp(candidate, this.config.externalIp)
                logger.debug(`onLocalCandidate injected external ip ${candidate} ${mid}`)
            }
            remoteConnector.sendIceCandidate(candidate, mid, connection.connectionId.toString())
        })

        if (offering) {
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcOffer(description, connection.connectionId.toString())
            })
        } else {
            connection.once('localDescription', (description: string) => {
                remoteConnector.sendRtcAnswer(description, connection.connectionId.toString())
            })
        }

        connection.start(offering)

        if (!offering) {
            remoteConnector.requestConnection()
        }

        return managedConnection
    }

    setLocalPeerDescriptor(peerDescriptor: PeerDescriptor): void {
        this.localPeerDescriptor = peerDescriptor
    }

    public async stop(): Promise<void> {
        logger.trace('stop()')
        this.stopped = true

        const attempts = Array.from(this.ongoingConnectAttempts.values())
        await Promise.allSettled(attempts.map((conn) => conn.close('OTHER')))

        this.rpcCommunicator.destroy()
    }

    public isOffering(targetPeerDescriptor: PeerDescriptor): boolean {
        const myId = peerIdFromPeerDescriptor(this.localPeerDescriptor!)
        const theirId = peerIdFromPeerDescriptor(targetPeerDescriptor)
        return myId.hasSmallerHashThan(theirId)
    }
}
