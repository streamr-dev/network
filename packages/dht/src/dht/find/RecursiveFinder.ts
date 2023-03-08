import {
    DataEntry,
    FindMode,
    Message,
    MessageType,
    NodeType,
    PeerDescriptor,
    RecursiveFindRequest,
    RouteMessageAck,
    RouteMessageWrapper
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { createRouteMessageAck, Router, RoutingErrors } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RemoteRecursiveFindSession } from './RemoteRecursiveFindSession'
import { v4 } from 'uuid'
import { RecursiveFindSession, RecursiveFindSessionEvents } from './RecursiveFindSession'
import { RecursiveFindResult } from '../DhtNode'
import { DhtPeer } from '../DhtPeer'
import { ITransport } from '../../transport/ITransport'
import { LocalDataStore } from '../store/LocalDataStore'
import { IRoutingService } from '../../proto/packages/dht/protos/DhtRpc.server'

interface RecursiveFinderConfig {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    connections: Map<PeerIDKey, DhtPeer>
    router: Router
    ownPeerDescriptor: PeerDescriptor
    ownPeerId: PeerID
    serviceId: string
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    getClosestPeerDescriptors: (kademliaId: Uint8Array, limit: number) => PeerDescriptor[]
    isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
}

const logger = new Logger(module)

export class RecursiveFinder implements Pick<IRoutingService, 'findRecursively'> {

    private readonly config: RecursiveFinderConfig
    private ongoingSessions: Map<string, RecursiveFindSession> = new Map()
    private stopped = false

    constructor(config: RecursiveFinderConfig) {
        this.config = config
        this.findRecursively = this.findRecursively.bind(this)
        this.config.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'findRecursively', this.findRecursively)
    }

    public async startRecursiveFind(idToFind: Uint8Array, findMode: FindMode = FindMode.NODE): Promise<RecursiveFindResult> {
        const sessionId = v4()
        const recursiveFindSession = new RecursiveFindSession({
            serviceId: sessionId,
            rpcTransport: this.config.sessionTransport,
            kademliaIdToFind: idToFind,
            ownPeerID: this.config.ownPeerId!,
            routingPaths: this.config.connections.size > 1 ? 2 : 1
        })
        if (this.config.connections.size === 0) {
            const data = this.config.localDataStore.getEntry(PeerID.fromValue(idToFind))
            recursiveFindSession.doReportRecursiveFindResult(
                [this.config.ownPeerDescriptor!],
                [this.config.ownPeerDescriptor!],
                data ? Array.from(data.values()) : [],
                true
            )
            return recursiveFindSession.getResults()
        }
        const routeMessage = this.wrapRecursiveFindRequest(idToFind, sessionId, findMode)
        this.ongoingSessions.set(sessionId, recursiveFindSession)
        try {
            await runAndWaitForEvents3<RecursiveFindSessionEvents>(
                [() => this.doFindRecursevily(routeMessage)],
                [[recursiveFindSession, 'findCompleted']],
                30000
            )
        } catch (err) {
            logger.trace(`doFindRecursively failed with error ${err}`)
        }
        if (findMode === FindMode.DATA) {
            const data = this.config.localDataStore.getEntry(PeerID.fromValue(idToFind))
            if (data) {
                this.reportRecursiveFindResult([], this.config.ownPeerDescriptor, sessionId, [], data, true)
            }
        }
        this.ongoingSessions.delete(sessionId)
        return recursiveFindSession.getResults()
    }

    private wrapRecursiveFindRequest(idToFind: Uint8Array, sessionId: string, findMode: FindMode): RouteMessageWrapper {
        const targetDescriptor: PeerDescriptor = {
            kademliaId: idToFind,
            type: NodeType.VIRTUAL
        }
        const request: RecursiveFindRequest = {
            recursiveFindSessionId: sessionId,
            findMode
        }
        const msg: Message = {
            messageType: MessageType.RECURSIVE_FIND_REQUEST,
            messageId: v4(),
            serviceId: this.config.serviceId,
            body: {
                oneofKind: 'recursiveFindRequest',
                recursiveFindRequest: request
            }
        }
        const routeMessage: RouteMessageWrapper = {
            message: msg,
            requestId: v4(),
            destinationPeer: targetDescriptor,
            sourcePeer: this.config.ownPeerDescriptor,
            reachableThrough: [],
            routingPath: []
        }
        return routeMessage
    }

    private reportRecursiveFindResult(
        routingPath: PeerDescriptor[],
        targetPeerDescriptor: PeerDescriptor,
        serviceId: string,
        closestNodes: PeerDescriptor[],
        data: Map<PeerIDKey, DataEntry> | undefined,
        noCloserNodesFound: boolean = false
    ): void {
        const dataEntries: Array<DataEntry> = []
        if (data) {
            data.forEach((entry) => {
                dataEntries.push(DataEntry.create(entry))
            })
            logger.trace('dataEntries exist')
        }
        if (this.config.ownPeerId.equals(PeerID.fromValue(targetPeerDescriptor!.kademliaId))) {
            if (this.ongoingSessions.has(serviceId)) {
                this.ongoingSessions.get(serviceId)!
                    .doReportRecursiveFindResult(routingPath, closestNodes, dataEntries, noCloserNodesFound)
            }
        } else {
            const session = new RemoteRecursiveFindSession(
                this.config.ownPeerDescriptor,
                targetPeerDescriptor,
                serviceId,
                this.config.sessionTransport
            )
            session.reportRecursiveFindResult(routingPath, closestNodes, dataEntries, noCloserNodesFound)
        }
    }

    private doFindRecursevily(routedMessage: RouteMessageWrapper): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        }
        const idToFind = PeerID.fromValue(routedMessage.destinationPeer!.kademliaId)
        let recursiveFindRequest: RecursiveFindRequest | undefined
        const msg = routedMessage.message
        if (msg?.body.oneofKind === 'recursiveFindRequest') {
            recursiveFindRequest = msg.body.recursiveFindRequest
        }
        const closestPeersToDestination = this.config.getClosestPeerDescriptors(routedMessage.destinationPeer!.kademliaId, 5)
        if (recursiveFindRequest!.findMode === FindMode.DATA) {
            const data = this.config.localDataStore.getEntry(idToFind)
            if (data) {
                this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                    closestPeersToDestination, data, true)
                return createRouteMessageAck(routedMessage)
            }
        } else if (this.config.ownPeerId!.equals(idToFind)) {
            // Exact match, they were trying to find our kademliaID
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, undefined, true)
            return createRouteMessageAck(routedMessage)
        }
        const ack = this.config.router.doRouteMessage(routedMessage, RoutingMode.RECURSIVE_FIND)
        if (ack.error === RoutingErrors.NO_CANDIDATES_FOUND) {
            logger.trace(`findRecursively Node ${this.config.ownPeerDescriptor.nodeName} found no candidates`)
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, undefined, true)
            return ack
        } else {
            const noCloserContactsFound = (
                closestPeersToDestination.length > 0
                && routedMessage.previousPeer
                && !this.config.isPeerCloserToIdThanSelf(closestPeersToDestination[0], idToFind)
            )
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, undefined, noCloserContactsFound)
            return ack
        }
    }

    // IRoutingService method
    async findRecursively(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'findRecursively() service is not running')
        } else if (this.config.router.checkDuplicate(routedMessage.requestId)) {
            return createRouteMessageAck(routedMessage, 'message given to findRecursively() service is likely a duplicate')
        }
        logger.trace(`Node ${this.config.ownPeerDescriptor.nodeName} received findRecursively call from ${routedMessage.previousPeer!.nodeName!}`)
        this.config.addContact(routedMessage.sourcePeer!, true)
        this.config.router!.addToDuplicateDetector(routedMessage.requestId, keyFromPeerDescriptor(routedMessage.sourcePeer!))
        return this.doFindRecursevily(routedMessage)
    }

    public stop(): void {
        this.stopped = true
        this.ongoingSessions.forEach((session, _id) => {
            session.stop()
        })
    }
}
