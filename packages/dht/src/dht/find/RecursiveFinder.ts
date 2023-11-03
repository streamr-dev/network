import {
    DataEntry,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    FindRequest,
    RouteMessageAck,
    RouteMessageWrapper
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { createRouteMessageAck, RoutingErrors, IRouter } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { areEqualPeerDescriptors, keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { FindSessionRpcRemote } from './FindSessionRpcRemote'
import { v4 } from 'uuid'
import { RecursiveFindSession, RecursiveFindSessionEvents } from './RecursiveFindSession'
import { DhtNodeRpcRemote } from '../DhtNodeRpcRemote'
import { ITransport } from '../../transport/ITransport'
import { LocalDataStore } from '../store/LocalDataStore'
import { IFindRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { FindSessionRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { SortedContactList } from '../contact/SortedContactList'

interface RecursiveFinderConfig {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    connections: Map<PeerIDKey, DhtNodeRpcRemote>
    router: IRouter
    localPeerDescriptor: PeerDescriptor
    serviceId: string
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
}

interface RecursiveFinderFunc {
    startRecursiveFind(idToFind: Uint8Array, fetchData?: boolean): Promise<RecursiveFindResult>
}

export type IRecursiveFinder = IFindRpc & RecursiveFinderFunc

export interface RecursiveFindResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

const logger = new Logger(module)

export class RecursiveFinder implements IRecursiveFinder {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly sessionTransport: ITransport
    private readonly connections: Map<PeerIDKey, DhtNodeRpcRemote>
    private readonly router: IRouter
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly serviceId: string
    private readonly localDataStore: LocalDataStore
    private readonly addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    private readonly isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
    private ongoingSessions: Map<string, RecursiveFindSession> = new Map()
    private stopped = false

    constructor(config: RecursiveFinderConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.sessionTransport = config.sessionTransport
        this.connections = config.connections
        this.router = config.router
        this.localPeerDescriptor = config.localPeerDescriptor
        this.serviceId = config.serviceId
        this.localDataStore = config.localDataStore
        this.addContact = config.addContact
        this.isPeerCloserToIdThanSelf = config.isPeerCloserToIdThanSelf
        this.rpcCommunicator.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'routeFindRequest',
            (routedMessage: RouteMessageWrapper) => this.routeFindRequest(routedMessage))
    }

    public async startRecursiveFind(
        idToFind: Uint8Array,
        fetchData: boolean = false,
        excludedPeer?: PeerDescriptor
    ): Promise<RecursiveFindResult> {
        if (this.stopped) {
            return { closestNodes: [] }
        }
        const sessionId = v4()
        const recursiveFindSession = new RecursiveFindSession({
            serviceId: sessionId,
            transport: this.sessionTransport,
            kademliaIdToFind: idToFind,
            localPeerId: peerIdFromPeerDescriptor(this.localPeerDescriptor),
            waitedRoutingPathCompletions: this.connections.size > 1 ? 2 : 1,
            fetchData
        })
        if (this.connections.size === 0) {
            const data = this.localDataStore.getEntry(PeerID.fromValue(idToFind))
            recursiveFindSession.doSendFindResponse(
                [this.localPeerDescriptor],
                [this.localPeerDescriptor],
                data ? Array.from(data.values()) : [],
                true
            )
            return recursiveFindSession.getResults()
        }
        const routeMessage = this.wrapFindRequest(idToFind, sessionId, fetchData)
        this.ongoingSessions.set(sessionId, recursiveFindSession)
        try {
            await runAndWaitForEvents3<RecursiveFindSessionEvents>(
                [() => this.doRouteFindRequest(routeMessage, excludedPeer)],
                [[recursiveFindSession, 'findCompleted']],
                15000
            )
        } catch (err) {
            logger.debug(`doRouteFindRequest failed with error ${err}`)
        }
        this.findAndReportLocalData(idToFind, fetchData, [], this.localPeerDescriptor, sessionId)
        this.ongoingSessions.delete(sessionId)
        recursiveFindSession.stop()
        return recursiveFindSession.getResults()
    }

    private wrapFindRequest(idToFind: Uint8Array, sessionId: string, fetchData: boolean): RouteMessageWrapper {
        const targetDescriptor: PeerDescriptor = {
            kademliaId: idToFind,
            type: NodeType.VIRTUAL
        }
        const request: FindRequest = {
            sessionId,
            fetchData
        }
        const msg: Message = {
            messageType: MessageType.RECURSIVE_FIND_REQUEST,
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
        fetchData: boolean,
        routingPath: PeerDescriptor[],
        sourcePeer: PeerDescriptor,
        sessionId: string
    ): boolean {
        if (fetchData) {
            const data = this.localDataStore.getEntry(PeerID.fromValue(idToFind))
            if (data.size > 0) {
                this.sendFindResponse(routingPath, sourcePeer, sessionId, [], data, true)
                return true
            }
        }
        return false
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
        serviceId: string,
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
                toProtoRpcClient(new FindSessionRpcClient(remoteCommunicator.getRpcClientTransport()))
            )
            rpcRemote.sendFindResponse(routingPath, closestNodes, dataEntries, noCloserNodesFound)
            remoteCommunicator.destroy()
        }
    }

    private doRouteFindRequest(routedMessage: RouteMessageWrapper, excludedPeer?: PeerDescriptor): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        }
        const idToFind = peerIdFromPeerDescriptor(routedMessage.destinationPeer!)
        const msg = routedMessage.message
        const findRequest = msg?.body.oneofKind === 'findRequest' ? msg.body.findRequest : undefined
        const closestPeersToDestination = this.getClosestConnections(routedMessage.destinationPeer!.kademliaId, 5)
        const data = this.findLocalData(idToFind.value, findRequest!.fetchData)
        if (areEqualPeerDescriptors(this.localPeerDescriptor, routedMessage.destinationPeer!)) {
            this.sendFindResponse(routedMessage.routingPath, routedMessage.sourcePeer!, findRequest!.sessionId,
                closestPeersToDestination, data, true)
            return createRouteMessageAck(routedMessage)
        }
        const ack = this.router.doRouteMessage(routedMessage, RoutingMode.RECURSIVE_FIND, excludedPeer)
        if (ack.error === RoutingErrors.NO_CANDIDATES_FOUND) {
            logger.trace(`routeFindRequest Node found no candidates`)
            this.sendFindResponse(routedMessage.routingPath, routedMessage.sourcePeer!, findRequest!.sessionId,
                closestPeersToDestination, data, true)
        } else if (ack.error) {
            return ack
        } else {
            const noCloserContactsFound = (
                closestPeersToDestination.length > 0
                && routedMessage.previousPeer
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

    // IFindRpc method
    async routeFindRequest(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'routeFindRequest() service is not running')
        } else if (this.router.isMostLikelyDuplicate(routedMessage.requestId)) {
            return createRouteMessageAck(routedMessage, 'message given to routeFindRequest() service is likely a duplicate')
        }
        const senderKey = keyFromPeerDescriptor(routedMessage.previousPeer || routedMessage.sourcePeer!)
        logger.trace(`Received routeFindRequest call from ${senderKey}`)
        this.addContact(routedMessage.sourcePeer!, true)
        this.router.addToDuplicateDetector(routedMessage.requestId)
        return this.doRouteFindRequest(routedMessage)
    }

    public stop(): void {
        this.stopped = true
        this.ongoingSessions.forEach((session, _id) => {
            session.stop()
        })
        this.ongoingSessions.clear()
    }
}
