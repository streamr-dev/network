import {
    DataEntry,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    FindRequest,
    RouteMessageAck,
    RouteMessageWrapper,
    RouteMessageError,
    FindAction
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { IRouter } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { areEqualPeerDescriptors, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { FindSessionRpcRemote } from './FindSessionRpcRemote'
import { v4 } from 'uuid'
import { FindSession, FindSessionEvents } from './FindSession'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ITransport } from '../../transport/ITransport'
import { LocalDataStore } from '../store/LocalDataStore'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { FindSessionRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { SortedContactList } from '../contact/SortedContactList'
import { getPreviousPeer } from '../routing/getPreviousPeer'
import { createRouteMessageAck } from '../routing/RouterRpcLocal'
import { ServiceID } from '../../types/ServiceID'
import { FindRpcLocal } from './FindRpcLocal'

interface FinderConfig {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    connections: Map<PeerIDKey, DhtNodeRpcRemote>
    router: IRouter
    localPeerDescriptor: PeerDescriptor
    serviceId: ServiceID
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor) => void
    isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
}

export interface IFinder {
    startFind(idToFind: Uint8Array, action?: FindAction): Promise<FindResult>
}

export interface FindResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

const logger = new Logger(module)

export class Finder implements IFinder {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly sessionTransport: ITransport
    private readonly connections: Map<PeerIDKey, DhtNodeRpcRemote>
    private readonly router: IRouter
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly serviceId: ServiceID
    private readonly localDataStore: LocalDataStore
    private readonly isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
    private ongoingSessions: Map<string, FindSession> = new Map()
    private stopped = false

    constructor(config: FinderConfig) {
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

    private registerLocalRpcMethods(config: FinderConfig) {
        const rpcLocal = new FindRpcLocal({
            doRouteFindRequest: (routedMessage: RouteMessageWrapper) => this.doRouteFindRequest(routedMessage),
            addContact: (contact: PeerDescriptor) => config.addContact(contact),
            isMostLikelyDuplicate: (requestId: string) => this.router.isMostLikelyDuplicate(requestId),
            addToDuplicateDetector: (requestId: string) => this.router.addToDuplicateDetector(requestId)
        })
        this.rpcCommunicator.registerRpcMethod(
            RouteMessageWrapper,
            RouteMessageAck,
            'routeFindRequest',
            async (routedMessage: RouteMessageWrapper) => {
                if (this.stopped) {
                    return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
                } else {
                    return rpcLocal.routeFindRequest(routedMessage)
                }
            }
        )
    }

    public async startFind(
        idToFind: Uint8Array,
        action: FindAction = FindAction.NODE,
        excludedPeer?: PeerDescriptor
    ): Promise<FindResult> {
        if (this.stopped) {
            return { closestNodes: [] }
        }
        const sessionId = v4()
        const session = new FindSession({
            serviceId: sessionId,
            transport: this.sessionTransport,
            kademliaIdToFind: idToFind,
            localPeerId: peerIdFromPeerDescriptor(this.localPeerDescriptor),
            waitedRoutingPathCompletions: this.connections.size > 1 ? 2 : 1,
            action
        })
        if (this.connections.size === 0) {
            const data = this.localDataStore.getEntry(PeerID.fromValue(idToFind))
            session.doSendFindResponse(
                [this.localPeerDescriptor],
                [this.localPeerDescriptor],
                Array.from(data.values()),
                true
            )
            return session.getResults()
        }
        const routeMessage = this.wrapFindRequest(idToFind, sessionId, action)
        this.ongoingSessions.set(sessionId, session)
        try {
            await runAndWaitForEvents3<FindSessionEvents>(
                [() => this.doRouteFindRequest(routeMessage, excludedPeer)],
                [[session, 'findCompleted']],
                15000
            )
        } catch (err) {
            logger.debug(`doRouteFindRequest failed with error ${err}`)
        }
        if (action === FindAction.FETCH_DATA) {
            this.findAndReportLocalData(idToFind, [], this.localPeerDescriptor, sessionId)
        } else if (action === FindAction.DELETE_DATA) {
            this.localDataStore.markAsDeleted(idToFind, peerIdFromPeerDescriptor(this.localPeerDescriptor))
        }
        this.ongoingSessions.delete(sessionId)
        session.stop()
        return session.getResults()
    }

    private wrapFindRequest(idToFind: Uint8Array, sessionId: string, action: FindAction): RouteMessageWrapper {
        const targetDescriptor: PeerDescriptor = {
            kademliaId: idToFind,
            type: NodeType.VIRTUAL
        }
        const request: FindRequest = {
            sessionId,
            action
        }
        const msg: Message = {
            messageType: MessageType.FIND_REQUEST,
            messageId: v4(),
            serviceId: this.serviceId,
            body: {
                oneofKind: 'findRequest',
                findRequest: request
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

    private findAndReportLocalData(
        idToFind: Uint8Array,
        routingPath: PeerDescriptor[],
        sourcePeer: PeerDescriptor,
        sessionId: string
    ): void {
        const data = this.localDataStore.getEntry(PeerID.fromValue(idToFind))
        if (data.size > 0) {
            this.sendFindResponse(routingPath, sourcePeer, sessionId, [], data, true)
        }
    }

    private findLocalData(idToFind: Uint8Array, fetchData: boolean): Map<PeerIDKey, DataEntry> | undefined {
        if (fetchData) {
            return this.localDataStore.getEntry(PeerID.fromValue(idToFind))
        }
        return undefined
    }

    private sendFindResponse(
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
                .doSendFindResponse(routingPath, closestNodes, dataEntries, noCloserNodesFound)
        } else {
            const remoteCommunicator = new ListeningRpcCommunicator(serviceId, this.sessionTransport, { rpcRequestTimeout: 15000 })
            const rpcRemote = new FindSessionRpcRemote(
                this.localPeerDescriptor,
                targetPeerDescriptor,
                serviceId,
                toProtoRpcClient(new FindSessionRpcClient(remoteCommunicator.getRpcClientTransport())),
                10000
            )
            rpcRemote.sendFindResponse(routingPath, closestNodes, dataEntries, noCloserNodesFound)
            remoteCommunicator.destroy()
        }
    }

    private doRouteFindRequest(routedMessage: RouteMessageWrapper, excludedPeer?: PeerDescriptor): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, RouteMessageError.STOPPED)
        }
        const idToFind = peerIdFromPeerDescriptor(routedMessage.destinationPeer!)
        const msg = routedMessage.message
        const findRequest = msg?.body.oneofKind === 'findRequest' ? msg.body.findRequest : undefined
        const closestPeersToDestination = this.getClosestConnections(routedMessage.destinationPeer!.kademliaId, 5)
        const data = this.findLocalData(idToFind.value, findRequest!.action === FindAction.FETCH_DATA)
        if (findRequest!.action === FindAction.DELETE_DATA) {
            this.localDataStore.markAsDeleted(idToFind.value, peerIdFromPeerDescriptor(routedMessage.sourcePeer!))
        }
        if (areEqualPeerDescriptors(this.localPeerDescriptor, routedMessage.destinationPeer!)) {
            this.sendFindResponse(routedMessage.routingPath, routedMessage.sourcePeer!, findRequest!.sessionId,
                closestPeersToDestination, data, true)
            return createRouteMessageAck(routedMessage)
        }
        const ack = this.router.doRouteMessage(routedMessage, RoutingMode.FIND, excludedPeer)
        if (ack.error === RouteMessageError.NO_TARGETS) {
            logger.trace(`routeFindRequest Node found no candidates`)
            this.sendFindResponse(routedMessage.routingPath, routedMessage.sourcePeer!, findRequest!.sessionId,
                closestPeersToDestination, data, true)
        } else if (ack.error) {
            return ack
        } else {
            const noCloserContactsFound = (
                closestPeersToDestination.length > 0
                && getPreviousPeer(routedMessage)
                && !this.isPeerCloserToIdThanSelf(closestPeersToDestination[0], idToFind)
            )
            this.sendFindResponse(routedMessage.routingPath, routedMessage.sourcePeer!, findRequest!.sessionId,
                closestPeersToDestination, data, noCloserContactsFound)
        }
        return ack
    }

    private getClosestConnections(kademliaId: Uint8Array, limit: number): PeerDescriptor[] {
        const connectedPeers = Array.from(this.connections.values())
        const closestPeers = new SortedContactList<DhtNodeRpcRemote>(
            PeerID.fromValue(kademliaId),
            limit,
            undefined,
            true,
            undefined
        )
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
