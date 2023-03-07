import {
    DataEntry,
    FindMode, Message, MessageType, NodeType,
    PeerDescriptor,
    RecursiveFindRequest,
    RouteMessageAck,
    RouteMessageWrapper
} from '../../proto/packages/dht/protos/DhtRpc'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { createRouteMessageAck, Router } from '../routing/Router'
import { RoutingMode, RoutingSession, RoutingSessionEvents } from '../routing/RoutingSession'
import { keyFromPeerDescriptor, peerIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, runAndRaceEvents3, RunAndRaceEventsReturnType, runAndWaitForEvents3 } from '@streamr/utils'
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
        this.ongoingSessions.set(sessionId, recursiveFindSession)
        const targetDescriptor: PeerDescriptor = { kademliaId: idToFind, type: NodeType.VIRTUAL }
        const request: RecursiveFindRequest = {
            recursiveFindSessionId: sessionId,
            findMode: findMode
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
        const params: RouteMessageWrapper = {
            message: msg,
            requestId: v4(),
            destinationPeer: targetDescriptor,
            sourcePeer: this.config.ownPeerDescriptor,
            reachableThrough: [],
            routingPath: []
        }
        try {
            await runAndWaitForEvents3<RecursiveFindSessionEvents>(
                [() => this.doFindRecursevily(params)],
                [[recursiveFindSession, 'findCompleted']],
                30000
            )
        } catch (err) {
            logger.trace(`doFindRecursively failed with error ${err}`)
        }
        if (findMode === FindMode.DATA) {
            const data = this.config.localDataStore.getEntry(PeerID.fromValue(idToFind))
            if (data) {
                this.reportRecursiveFindResult([], params.sourcePeer!, sessionId, [], data, true)
            }
        }
        return recursiveFindSession.getResults()
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

    private async doFindRecursevily(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        routedMessage.routingPath.push(this.config.ownPeerDescriptor)
        logger.debug('findRecursively recursiveFindPath ' + routedMessage.routingPath.map((descriptor) => descriptor.nodeName))
        const idToFind = PeerID.fromValue(routedMessage.destinationPeer!.kademliaId)
        let recursiveFindRequest: RecursiveFindRequest | undefined
        const msg = routedMessage.message
        if (msg?.body.oneofKind === 'recursiveFindRequest') {
            recursiveFindRequest = msg.body.recursiveFindRequest
        }
        const closestPeersToDestination = this.config.getClosestPeerDescriptors(routedMessage.destinationPeer!.kademliaId, 5)
        if (recursiveFindRequest!.findMode == FindMode.DATA) {
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
        const session = new RoutingSession(
            this.config.rpcCommunicator,
            this.config.ownPeerDescriptor,
            routedMessage,
            this.config.connections,
            this.config.ownPeerId.equals(peerIdFromPeerDescriptor(routedMessage.sourcePeer!)) ? 2 : 1,
            1500,
            RoutingMode.RECURSIVE_FIND,
            undefined,
            routedMessage.routingPath.map((descriptor) => peerIdFromPeerDescriptor(descriptor))
        )
        this.config.router.addRoutingSession(session)
        session.on('routingFailed', () => {
            logger.debug(`findRecursively Node ${this.config.ownPeerDescriptor.nodeName} giving up routing`)
        })
        let result: RunAndRaceEventsReturnType<RoutingSessionEvents>
        try {
            result = await runAndRaceEvents3<RoutingSessionEvents>([() => {
                session.start()
            }], session, ['noCandidatesFound', 'candidatesFound'], 1500)
        } catch (e) {
            logger.debug(e)
        }
        this.config.router.removeRoutingSession(session.sessionId)
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        } else if (result!.winnerName === 'noCandidatesFound' || result!.winnerName === 'routingFailed') {
            if (peerIdFromPeerDescriptor(routedMessage.sourcePeer!).equals(this.config.ownPeerId)) {
                throw new Error(`Could not perform initial routing`)
            }
            logger.trace(`findRecursively Node ${this.config.ownPeerDescriptor.nodeName} found no candidates`)
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, undefined, true)
            return createRouteMessageAck(routedMessage)
        } else {
            const closestContacts = session.getClosestContacts(5)
            const noCloserContactsFound = (
                closestContacts.length > 0
                && routedMessage.previousPeer
                && !this.config.isPeerCloserToIdThanSelf(closestContacts[0], idToFind)
            )
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestContacts, undefined, noCloserContactsFound)
            return createRouteMessageAck(routedMessage)
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
