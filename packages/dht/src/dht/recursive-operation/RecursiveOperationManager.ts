import {
    DataEntry,
    PeerDescriptor,
    RecursiveOperation,
    RecursiveOperationRequest,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../../generated/packages/dht/protos/DhtRpc'
import { Router } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { Logger, areEqualBinaries, runAndWaitForEvents3, wait } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationSessionRpcRemote } from './RecursiveOperationSessionRpcRemote'
import {
    RECURSIVE_OPERATION_TIMEOUT,
    RecursiveOperationSession,
    RecursiveOperationSessionEvents
} from './RecursiveOperationSession'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ITransport } from '../../transport/ITransport'
import { LocalDataStore } from '../store/LocalDataStore'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RecursiveOperationSessionRpcClient } from '../../../generated/packages/dht/protos/DhtRpc.client'
import { SortedContactList } from '../contact/SortedContactList'
import { getPreviousPeer } from '../routing/getPreviousPeer'
import { createRouteMessageAck } from '../routing/RouterRpcLocal'
import { ServiceID } from '../../types/ServiceID'
import { RecursiveOperationRpcLocal } from './RecursiveOperationRpcLocal'
import { DhtAddress, areEqualPeerDescriptors, toDhtAddress, toNodeId, toDhtAddressRaw } from '../../identifiers'
import { getDistance } from '../PeerManager'
import { ConnectionsView } from '../../exports'

interface RecursiveOperationManagerOptions {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    router: Router
    connectionsView: ConnectionsView
    localPeerDescriptor: PeerDescriptor
    serviceId: ServiceID
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor) => void
    createDhtNodeRpcRemote: (peerDescriptor: PeerDescriptor) => DhtNodeRpcRemote
}

export interface RecursiveOperationResult {
    closestNodes: PeerDescriptor[]
    dataEntries?: DataEntry[]
}

const logger = new Logger(module)

export class RecursiveOperationManager {
    private ongoingSessions: Map<string, RecursiveOperationSession> = new Map()
    private stopped = false
    private readonly options: RecursiveOperationManagerOptions

    constructor(options: RecursiveOperationManagerOptions) {
        this.options = options
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RecursiveOperationRpcLocal({
            doRouteRequest: (routedMessage: RouteMessageWrapper) => this.doRouteRequest(routedMessage),
            addContact: (contact: PeerDescriptor) => this.options.addContact(contact),
            isMostLikelyDuplicate: (requestId: string) => this.options.router.isMostLikelyDuplicate(requestId),
            addToDuplicateDetector: (requestId: string) => this.options.router.addToDuplicateDetector(requestId)
        })
        this.options.rpcCommunicator.registerRpcMethod(
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
        targetId: DhtAddress,
        operation: RecursiveOperation,
        excludedPeer?: DhtAddress,
        waitForCompletion = true
    ): Promise<RecursiveOperationResult> {
        if (this.stopped) {
            return { closestNodes: [] }
        }
        const session = new RecursiveOperationSession({
            transport: this.options.sessionTransport,
            targetId,
            localPeerDescriptor: this.options.localPeerDescriptor,
            // TODO use options option or named constant?
            waitedRoutingPathCompletions: this.options.connectionsView.getConnectionCount() > 1 ? 2 : 1,
            operation,
            // TODO would it make sense to give excludedPeer as one of the fields RecursiveOperationSession?
            doRouteRequest: (routedMessage: RouteMessageWrapper) => {
                return this.doRouteRequest(routedMessage, excludedPeer)
            }
        })
        if (this.options.connectionsView.getConnectionCount() === 0) {
            const dataEntries = Array.from(this.options.localDataStore.values(targetId))
            session.onResponseReceived(
                toNodeId(this.options.localPeerDescriptor),
                [this.options.localPeerDescriptor],
                [this.options.localPeerDescriptor],
                dataEntries,
                true
            )
            return session.getResults()
        }
        this.ongoingSessions.set(session.getId(), session)
        if (waitForCompletion === true) {
            try {
                await runAndWaitForEvents3<RecursiveOperationSessionEvents>(
                    [() => session.start(this.options.serviceId)],
                    [[session, 'completed']],
                    // TODO use options option or named constant?
                    RECURSIVE_OPERATION_TIMEOUT
                )
            } catch (err) {
                logger.debug('start failed', { err })
            }
        } else {
            session.start(this.options.serviceId)
            // Wait for delete operation to be sent out by the router
            // TODO: Add a feature to wait for the router to pass the message?
            await wait(50)
        }
        if (operation === RecursiveOperation.FETCH_DATA) {
            const dataEntries = Array.from(this.options.localDataStore.values(targetId))
            if (dataEntries.length > 0) {
                this.sendResponse(
                    [this.options.localPeerDescriptor],
                    this.options.localPeerDescriptor,
                    session.getId(),
                    [],
                    dataEntries,
                    true
                )
            }
        } else if (operation === RecursiveOperation.DELETE_DATA) {
            this.options.localDataStore.markAsDeleted(targetId, toNodeId(this.options.localPeerDescriptor))
        }
        this.ongoingSessions.delete(session.getId())
        session.stop()
        return session.getResults()
    }

    private sendResponse(
        routingPath: PeerDescriptor[],
        targetPeerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        closestConnectedNodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean = false
    ): void {
        const isOwnNode = areEqualPeerDescriptors(this.options.localPeerDescriptor, targetPeerDescriptor)
        if (isOwnNode && this.ongoingSessions.has(serviceId)) {
            this.ongoingSessions
                .get(serviceId)!
                .onResponseReceived(
                    toNodeId(this.options.localPeerDescriptor),
                    routingPath,
                    closestConnectedNodes,
                    dataEntries,
                    noCloserNodesFound
                )
        } else {
            // TODO use options option or named constant?
            const remoteCommunicator = new ListeningRpcCommunicator(serviceId, this.options.sessionTransport, {
                rpcRequestTimeout: RECURSIVE_OPERATION_TIMEOUT
            })
            const rpcRemote = new RecursiveOperationSessionRpcRemote(
                this.options.localPeerDescriptor,
                targetPeerDescriptor,
                remoteCommunicator,
                RecursiveOperationSessionRpcClient,
                // TODO use options option or named constant?
                10000
            )
            rpcRemote.sendResponse(routingPath, closestConnectedNodes, dataEntries, noCloserNodesFound)
            remoteCommunicator.destroy()
        }
    }

    private doRouteRequest(routedMessage: RouteMessageWrapper, excludedPeer?: DhtAddress): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
        }
        const targetId = toDhtAddress(routedMessage.target)
        const request = (routedMessage.message!.body as { recursiveOperationRequest: RecursiveOperationRequest })
            .recursiveOperationRequest
        // TODO use options option or named constant?
        const closestConnectedNodes = this.getClosestConnectedNodes(targetId, 5)
        const dataEntries =
            request.operation === RecursiveOperation.FETCH_DATA
                ? Array.from(this.options.localDataStore.values(targetId))
                : []
        if (request.operation === RecursiveOperation.DELETE_DATA) {
            this.options.localDataStore.markAsDeleted(targetId, toNodeId(routedMessage.sourcePeer!))
        }
        if (areEqualBinaries(this.options.localPeerDescriptor.nodeId, routedMessage.target)) {
            // TODO this is also very similar case to what we do at line 255, could simplify the code paths?
            this.sendResponse(
                routedMessage.routingPath,
                routedMessage.sourcePeer!,
                request.sessionId,
                closestConnectedNodes,
                dataEntries,
                true
            )
            return createRouteMessageAck(routedMessage)
        } else {
            const ack = this.options.router.doRouteMessage(routedMessage, RoutingMode.RECURSIVE, excludedPeer)
            if (ack.error === undefined || ack.error === RouteMessageError.NO_TARGETS) {
                const noCloserContactsFound =
                    ack.error === RouteMessageError.NO_TARGETS ||
                    (closestConnectedNodes.length > 0 &&
                        getPreviousPeer(routedMessage) &&
                        !this.isPeerCloserToIdThanSelf(closestConnectedNodes[0], targetId))
                this.sendResponse(
                    routedMessage.routingPath,
                    routedMessage.sourcePeer!,
                    request.sessionId,
                    closestConnectedNodes,
                    dataEntries,
                    noCloserContactsFound
                )
            }
            return ack
        }
    }

    private getClosestConnectedNodes(referenceId: DhtAddress, limit: number): PeerDescriptor[] {
        const connectedNodes = this.options.connectionsView
            .getConnections()
            .map((c) => this.options.createDhtNodeRpcRemote(c))
        const sorted = new SortedContactList<DhtNodeRpcRemote>({
            referenceId,
            maxSize: limit,
            allowToContainReferenceId: true
        })
        sorted.addContacts(connectedNodes)
        return sorted.getClosestContacts(limit).map((peer) => peer.getPeerDescriptor())
    }

    private isPeerCloserToIdThanSelf(peer: PeerDescriptor, nodeIdOrDataKey: DhtAddress): boolean {
        const nodeIdOrDataKeyRaw = toDhtAddressRaw(nodeIdOrDataKey)
        const distance1 = getDistance(peer.nodeId, nodeIdOrDataKeyRaw)
        const distance2 = getDistance(this.options.localPeerDescriptor.nodeId, nodeIdOrDataKeyRaw)
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
