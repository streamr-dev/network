import {
    DataEntry,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    RecursiveOperation,
    RecursiveOperationRequest,
    RouteMessageAck,
    RouteMessageError,
    RouteMessageWrapper
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { IRouter } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { areEqualPeerDescriptors, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, runAndWaitForEvents3, wait } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RecursiveOperationSessionRpcRemote } from './RecursiveOperationSessionRpcRemote'
import { v4 } from 'uuid'
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

interface RecursiveOperationManagerConfig {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    connections: Map<NodeID, DhtNodeRpcRemote>
    router: IRouter
    localPeerDescriptor: PeerDescriptor
    serviceId: ServiceID
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor) => void
    isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
}

export interface IRecursiveOperationManager {
    execute(targetId: Uint8Array, operation: RecursiveOperation): Promise<RecursiveOperationResult>
}

export interface RecursiveOperationResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

const logger = new Logger(module)

export class RecursiveOperationManager implements IRecursiveOperationManager {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly sessionTransport: ITransport
    private readonly connections: Map<NodeID, DhtNodeRpcRemote>
    private readonly router: IRouter
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly serviceId: ServiceID
    private readonly localDataStore: LocalDataStore
    private readonly isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
    private ongoingSessions: Map<string, RecursiveOperationSession> = new Map()
    private stopped = false

    constructor(config: RecursiveOperationManagerConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.sessionTransport = config.sessionTransport
        this.connections = config.connections
        this.router = config.router
        this.localPeerDescriptor = config.localPeerDescriptor
        this.serviceId = config.serviceId
        this.localDataStore = config.localDataStore
        this.isPeerCloserToIdThanSelf = config.isPeerCloserToIdThanSelf
        this.registerLocalRpcMethods(config)
    }

    private registerLocalRpcMethods(config: RecursiveOperationManagerConfig) {
        const rpcLocal = new RecursiveOperationRpcLocal({
            doRouteRequest: (routedMessage: RouteMessageWrapper) => this.doRouteRequest(routedMessage),
            addContact: (contact: PeerDescriptor) => config.addContact(contact),
            isMostLikelyDuplicate: (requestId: string) => this.router.isMostLikelyDuplicate(requestId),
            addToDuplicateDetector: (requestId: string) => this.router.addToDuplicateDetector(requestId)
        })
        this.rpcCommunicator.registerRpcMethod(
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
        const sessionId = v4()
        const session = new RecursiveOperationSession({
            serviceId: sessionId,
            transport: this.sessionTransport,
            targetId,
            localPeerId: peerIdFromPeerDescriptor(this.localPeerDescriptor),
            // TODO use config option or named constant?
            waitedRoutingPathCompletions: this.connections.size > 1 ? 2 : 1,
            operation
        })
        if (this.connections.size === 0) {
            const data = this.localDataStore.getEntries(targetId)
            session.doSendResponse(
                [this.localPeerDescriptor],
                [this.localPeerDescriptor],
                Array.from(data.values()),
                true
            )
            return session.getResults()
        }
        const routeMessage = this.wrapRequest(targetId, sessionId, operation)
        this.ongoingSessions.set(sessionId, session)
        if (waitForCompletion === true) {
            try {
                await runAndWaitForEvents3<RecursiveOperationSessionEvents>(
                    [() => this.doRouteRequest(routeMessage, excludedPeer)],
                    [[session, 'completed']],
                    // TODO use config option or named constant?
                    15000
                )
            } catch (err) {
                logger.debug(`doRouteRequest failed with error ${err}`)
            }
        } else {
            this.doRouteRequest(routeMessage, excludedPeer)
            // Wait for delete operation to be sent out by the router
            // TODO: Add a feature to wait for the router to pass the message?
            await wait(50)
        }
        if (operation === RecursiveOperation.FETCH_DATA) {
            const data = this.localDataStore.getEntries(targetId)
            if (data.size > 0) {
                this.sendResponse([], this.localPeerDescriptor, sessionId, [], data, true)
            }
        } else if (operation === RecursiveOperation.DELETE_DATA) {
            this.localDataStore.markAsDeleted(targetId, peerIdFromPeerDescriptor(this.localPeerDescriptor))
        }
        this.ongoingSessions.delete(sessionId)
        session.stop()
        return session.getResults()
    }

    private wrapRequest(targetId: Uint8Array, sessionId: string, operation: RecursiveOperation): RouteMessageWrapper {
        const targetDescriptor: PeerDescriptor = {
            nodeId: targetId,
            type: NodeType.VIRTUAL
        }
        const request: RecursiveOperationRequest = {
            sessionId,
            operation
        }
        const msg: Message = {
            messageType: MessageType.RECURSIVE_OPERATION_REQUEST,
            messageId: v4(),
            serviceId: this.serviceId,
            body: {
                oneofKind: 'recursiveOperationRequest',
                recursiveOperationRequest: request
            }
        }
        const routeMessage: RouteMessageWrapper = {
            message: msg,
            requestId: v4(),
            destinationPeer: targetDescriptor,
            sourcePeer: this.localPeerDescriptor,
            reachableThrough: [],
            routingPath: []
        }
        return routeMessage
    }

    private sendResponse(
        routingPath: PeerDescriptor[],
        targetPeerDescriptor: PeerDescriptor,
        serviceId: ServiceID,
        closestNodes: PeerDescriptor[],
        data: Map<PeerIDKey, DataEntry> | undefined,
        noCloserNodesFound: boolean = false
    ): void {
        const dataEntries = data ? Array.from(data.values(), DataEntry.create.bind(DataEntry)) : []
        const isOwnNode = areEqualPeerDescriptors(this.localPeerDescriptor, targetPeerDescriptor)
        if (isOwnNode && this.ongoingSessions.has(serviceId)) {
            this.ongoingSessions.get(serviceId)!
                .doSendResponse(routingPath, closestNodes, dataEntries, noCloserNodesFound)
        } else {
            // TODO use config option or named constant?
            const remoteCommunicator = new ListeningRpcCommunicator(serviceId, this.sessionTransport, { rpcRequestTimeout: 15000 })
            const rpcRemote = new RecursiveOperationSessionRpcRemote(
                this.localPeerDescriptor,
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
        const targetId = peerIdFromPeerDescriptor(routedMessage.destinationPeer!)
        const msg = routedMessage.message
        const recursiveOperationRequest = msg?.body.oneofKind === 'recursiveOperationRequest' ? msg.body.recursiveOperationRequest : undefined
        // TODO use config option or named constant?
        const closestPeersToDestination = this.getClosestConnections(routedMessage.destinationPeer!.nodeId, 5)
        const data = (recursiveOperationRequest!.operation === RecursiveOperation.FETCH_DATA) 
            ? this.localDataStore.getEntries(targetId.value) 
            : undefined
        if (recursiveOperationRequest!.operation === RecursiveOperation.DELETE_DATA) {
            this.localDataStore.markAsDeleted(targetId.value, peerIdFromPeerDescriptor(routedMessage.sourcePeer!))
        }
        if (areEqualPeerDescriptors(this.localPeerDescriptor, routedMessage.destinationPeer!)) {
            // TODO this is also very similar case to what we do at line 255, could simplify the code paths?
            this.sendResponse(
                routedMessage.routingPath,
                routedMessage.sourcePeer!,
                recursiveOperationRequest!.sessionId,
                closestPeersToDestination,
                data,
                true
            )
            return createRouteMessageAck(routedMessage)
        } else {
            const ack = this.router.doRouteMessage(routedMessage, RoutingMode.RECURSIVE, excludedPeer)
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
                    recursiveOperationRequest!.sessionId,
                    closestPeersToDestination,
                    data,
                    noCloserContactsFound
                )
            }
            return ack
        }    
    }

    private getClosestConnections(nodeId: Uint8Array, limit: number): PeerDescriptor[] {
        const connectedPeers = Array.from(this.connections.values())
        const closestPeers = new SortedContactList<DhtNodeRpcRemote>({
            referenceId: getNodeIdFromBinary(nodeId),
            maxSize: limit,
            allowToContainReferenceId: true,
            emitEvents: false
        })
        closestPeers.addContacts(connectedPeers)
        return closestPeers.getClosestContacts(limit).map((peer) => peer.getPeerDescriptor())
    }

    public stop(): void {
        this.stopped = true
        this.ongoingSessions.forEach((session, _id) => {
            session.stop()
        })
        this.ongoingSessions.clear()
    }
}
