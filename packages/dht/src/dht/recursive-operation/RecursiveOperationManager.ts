import {
    DataEntry,
    PeerDescriptor,
    RecursiveOperation,
    RecursiveOperationRequest,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../proto/packages/dht/protos/DhtRpc'
import { Router } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { areEqualPeerDescriptors, getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, hexToBinary, runAndWaitForEvents3, wait } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationSessionRpcRemote } from './RecursiveOperationSessionRpcRemote'
import { RecursiveOperationSession, RecursiveOperationSessionEvents } from './RecursiveOperationSession'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ITransport } from '../../transport/ITransport'
import { LocalDataStore } from '../store/LocalDataStore'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RecursiveOperationSessionRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { SortedContactList } from '../contact/SortedContactList'
import { getPreviousPeer } from '../routing/getPreviousPeer'
import { createRouteMessageAck } from '../routing/RouterRpcLocal'
import { ServiceID } from '../../types/ServiceID'
import { RecursiveOperationRpcLocal } from './RecursiveOperationRpcLocal'
import { NodeID, getNodeIdFromBinary } from '../../helpers/nodeId'
import { getDistance } from '../PeerManager'

interface RecursiveOperationManagerConfig {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    connections: Map<NodeID, DhtNodeRpcRemote>
    router: Router
    localPeerDescriptor: PeerDescriptor
    serviceId: ServiceID
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor) => void
}

export interface RecursiveOperationResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

const logger = new Logger(module)

export class RecursiveOperationManager {

    private ongoingSessions: Map<string, RecursiveOperationSession> = new Map()
    private stopped = false
    private readonly config: RecursiveOperationManagerConfig

    constructor(config: RecursiveOperationManagerConfig) {
        this.config = config
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RecursiveOperationRpcLocal({
            doRouteRequest: (routedMessage: RouteMessageWrapper) => this.doRouteRequest(routedMessage),
            addContact: (contact: PeerDescriptor) => this.config.addContact(contact),
            isMostLikelyDuplicate: (requestId: string) => this.config.router.isMostLikelyDuplicate(requestId),
            addToDuplicateDetector: (requestId: string) => this.config.router.addToDuplicateDetector(requestId)
        })
        this.config.rpcCommunicator.registerRpcMethod(
            RouteMessageWrapper,
            RouteMessageAck,
            'routeRequest',
            async (routedMessage: RouteMessageWrapper) => {
                if (this.stopped) {
                    return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
                } else {
                    return rpcLocal.routeRequest(routedMessage)
                }
            }
        )
    }

    public async execute(
        targetId: Uint8Array,
        operation: RecursiveOperation,
        excludedPeer?: PeerDescriptor,
        waitForCompletion = true
    ): Promise<RecursiveOperationResult> {
        if (this.stopped) {
            return { closestNodes: [] }
        }
        const session = new RecursiveOperationSession({
            transport: this.config.sessionTransport,
            targetId,
            localPeerDescriptor: this.config.localPeerDescriptor,
            // TODO use config option or named constant?
            waitedRoutingPathCompletions: this.config.connections.size > 1 ? 2 : 1,
            operation,
            // TODO would it make sense to give excludedPeer as one of the fields RecursiveOperationSession?
            doRouteRequest: (routedMessage: RouteMessageWrapper) => {
                return this.doRouteRequest(routedMessage, excludedPeer)
            }
        })
        if (this.config.connections.size === 0) {
            const data = this.config.localDataStore.getEntries(targetId)
            session.onResponseReceived(
                [this.config.localPeerDescriptor],
                [this.config.localPeerDescriptor],
                Array.from(data.values()),
                true
            )
            return session.getResults()
        }
        this.ongoingSessions.set(session.getId(), session)
        if (waitForCompletion === true) {
            try {
                await runAndWaitForEvents3<RecursiveOperationSessionEvents>(
                    [() => session.start(this.config.serviceId)],
                    [[session, 'completed']],
                    // TODO use config option or named constant?
                    15003
                )
            } catch (err) {
                logger.debug(`start failed with error ${err}`)
            }
        } else {
            session.start(this.config.serviceId)
            // Wait for delete operation to be sent out by the router
            // TODO: Add a feature to wait for the router to pass the message?
            await wait(50)
        }
        if (operation === RecursiveOperation.FETCH_DATA) {
            const dataEntries = Array.from(this.config.localDataStore.getEntries(targetId).values())
            if (dataEntries.length > 0) {
                this.sendResponse([], this.config.localPeerDescriptor, session.getId(), [], dataEntries, true)
            }
        } else if (operation === RecursiveOperation.DELETE_DATA) {
            this.config.localDataStore.markAsDeleted(targetId, getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor))
        }
        this.ongoingSessions.delete(session.getId())
        session.stop()
        return session.getResults()
    }

    private sendResponse(
        routingPath: PeerDescriptor[],
        targetPeerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        closestNodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean = false
    ): void {
        const isOwnNode = areEqualPeerDescriptors(this.config.localPeerDescriptor, targetPeerDescriptor)
        if (isOwnNode && this.ongoingSessions.has(serviceId)) {
            this.ongoingSessions.get(serviceId)!
                .onResponseReceived(routingPath, closestNodes, dataEntries, noCloserNodesFound)
        } else {
            // TODO use config option or named constant?
            const remoteCommunicator = new ListeningRpcCommunicator(serviceId, this.config.sessionTransport, { rpcRequestTimeout: 15007 })
            const rpcRemote = new RecursiveOperationSessionRpcRemote(
                this.config.localPeerDescriptor,
                targetPeerDescriptor,
                serviceId,
                toProtoRpcClient(new RecursiveOperationSessionRpcClient(remoteCommunicator.getRpcClientTransport())),
                // TODO use config option or named constant?
                10000
            )
            rpcRemote.sendResponse(routingPath, closestNodes, dataEntries, noCloserNodesFound)
            remoteCommunicator.destroy()
        }
    }

    private doRouteRequest(routedMessage: RouteMessageWrapper, excludedPeer?: PeerDescriptor): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
        }
        const targetId = getNodeIdFromPeerDescriptor(routedMessage.destinationPeer!)
        const request = (routedMessage.message!.body as { recursiveOperationRequest: RecursiveOperationRequest }).recursiveOperationRequest
        // TODO use config option or named constant?
        const closestPeersToDestination = this.getClosestConnections(routedMessage.destinationPeer!.nodeId, 5)
        const dataEntries = (request.operation === RecursiveOperation.FETCH_DATA) 
            ? Array.from(this.config.localDataStore.getEntries(hexToBinary(targetId)).values())
            : []
        if (request.operation === RecursiveOperation.DELETE_DATA) {
            this.config.localDataStore.markAsDeleted(hexToBinary(targetId), getNodeIdFromPeerDescriptor(routedMessage.sourcePeer!))
        }
        if (areEqualPeerDescriptors(this.config.localPeerDescriptor, routedMessage.destinationPeer!)) {
            // TODO this is also very similar case to what we do at line 255, could simplify the code paths?
            this.sendResponse(
                routedMessage.routingPath,
                routedMessage.sourcePeer!,
                request.sessionId,
                closestPeersToDestination,
                dataEntries,
                true
            )
            return createRouteMessageAck(routedMessage)
        } else {
            const ack = this.config.router.doRouteMessage(routedMessage, RoutingMode.RECURSIVE, excludedPeer)
            if ((ack.error === undefined) || (ack.error === RouteMessageError.NO_TARGETS)) {
                const noCloserContactsFound = (ack.error === RouteMessageError.NO_TARGETS) ||
                    (
                        closestPeersToDestination.length > 0 
                        && getPreviousPeer(routedMessage) 
                        && !this.isPeerCloserToIdThanSelf(closestPeersToDestination[0], targetId)
                    )
                this.sendResponse(
                    routedMessage.routingPath,
                    routedMessage.sourcePeer!,
                    request.sessionId,
                    closestPeersToDestination,
                    dataEntries,
                    noCloserContactsFound
                )
            }
            return ack
        }    
    }

    private getClosestConnections(nodeId: Uint8Array, limit: number): PeerDescriptor[] {
        const connectedPeers = Array.from(this.config.connections.values())
        const closestPeers = new SortedContactList<DhtNodeRpcRemote>({
            referenceId: getNodeIdFromBinary(nodeId),
            maxSize: limit,
            allowToContainReferenceId: true,
            emitEvents: false
        })
        closestPeers.addContacts(connectedPeers)
        return closestPeers.getClosestContacts(limit).map((peer) => peer.getPeerDescriptor())
    }

    private isPeerCloserToIdThanSelf(peer: PeerDescriptor, compareToId: NodeID): boolean {
        const distance1 = getDistance(getNodeIdFromPeerDescriptor(peer), compareToId)
        const distance2 = getDistance(getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor), compareToId)
        return distance1 < distance2
    }

    public stop(): void {
        this.stopped = true
        this.ongoingSessions.forEach((session, _id) => {
            session.stop()
        })
        this.ongoingSessions.clear()
    }
}
