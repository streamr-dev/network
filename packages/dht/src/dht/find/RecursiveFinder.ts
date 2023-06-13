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
import { createRouteMessageAck, RoutingErrors, IRouter } from '../routing/Router'
import { RoutingMode } from '../routing/RoutingSession'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { Logger, runAndWaitForEvents3 } from '@streamr/utils'
import { RoutingRpcCommunicator } from '../../transport/RoutingRpcCommunicator'
import { RemoteRecursiveFindSession } from './RemoteRecursiveFindSession'
import { v4 } from 'uuid'
import { RecursiveFindSession, RecursiveFindSessionEvents } from './RecursiveFindSession'
import { DhtPeer } from '../DhtPeer'
import { ITransport } from '../../transport/ITransport'
import { LocalDataStore } from '../store/LocalDataStore'
import { IRoutingService } from '../../proto/packages/dht/protos/DhtRpc.server'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { RecursiveFindSessionServiceClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { toProtoRpcClient } from '@streamr/proto-rpc'

interface RecursiveFinderConfig {
    rpcCommunicator: RoutingRpcCommunicator
    sessionTransport: ITransport
    connections: Map<PeerIDKey, DhtPeer>
    router: IRouter
    ownPeerDescriptor: PeerDescriptor
    ownPeerId: PeerID
    serviceId: string
    localDataStore: LocalDataStore
    addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    getClosestPeerDescriptors: (kademliaId: Uint8Array, limit: number) => PeerDescriptor[]
    isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
}

interface RecursiveFinderFunc {
    startRecursiveFind(idToFind: Uint8Array, findMode?: FindMode): Promise<RecursiveFindResult>
}

export interface IRecursiveFinder extends Pick<IRoutingService, 'findRecursively'>, RecursiveFinderFunc {}

export interface RecursiveFindResult { closestNodes: Array<PeerDescriptor>, dataEntries?: Array<DataEntry> }

const logger = new Logger(module)

export class RecursiveFinder implements IRecursiveFinder {

    private readonly rpcCommunicator: RoutingRpcCommunicator
    private readonly sessionTransport: ITransport
    private readonly connections: Map<PeerIDKey, DhtPeer>
    private readonly router: IRouter
    private readonly ownPeerDescriptor: PeerDescriptor
    private readonly ownPeerId: PeerID
    private readonly serviceId: string
    private readonly localDataStore: LocalDataStore
    private readonly addContact: (contact: PeerDescriptor, setActive?: boolean) => void
    private readonly getClosestPeerDescriptors: (kademliaId: Uint8Array, limit: number) => PeerDescriptor[]
    private readonly isPeerCloserToIdThanSelf: (peer1: PeerDescriptor, compareToId: PeerID) => boolean
    private ongoingSessions: Map<string, RecursiveFindSession> = new Map()
    private stopped = false

    constructor(config: RecursiveFinderConfig) {
        this.rpcCommunicator = config.rpcCommunicator
        this.sessionTransport = config.sessionTransport
        this.connections = config.connections
        this.router = config.router
        this.ownPeerDescriptor = config.ownPeerDescriptor
        this.ownPeerId = config.ownPeerId
        this.serviceId = config.serviceId
        this.localDataStore = config.localDataStore
        this.addContact = config.addContact
        this.getClosestPeerDescriptors = config.getClosestPeerDescriptors
        this.isPeerCloserToIdThanSelf = config.isPeerCloserToIdThanSelf
        this.rpcCommunicator!.registerRpcMethod(RouteMessageWrapper, RouteMessageAck, 'findRecursively',
            (routedMessage: RouteMessageWrapper) => this.findRecursively(routedMessage))
    }

    public async startRecursiveFind(
        idToFind: Uint8Array,
        findMode: FindMode = FindMode.NODE,
        excludedPeer?: PeerDescriptor
    ): Promise<RecursiveFindResult> {
        if (this.stopped) {
            return { closestNodes: [] }
        }
        const sessionId = v4()
        const recursiveFindSession = new RecursiveFindSession({
            serviceId: sessionId,
            rpcTransport: this.sessionTransport,
            kademliaIdToFind: idToFind,
            ownPeerID: this.ownPeerId!,
            waitedRoutingPathCompletions: this.connections.size > 1 ? 2 : 1,
            mode: findMode
        })
        if (this.connections.size === 0) {
            const data = this.localDataStore.getEntry(PeerID.fromValue(idToFind))
            recursiveFindSession.doReportRecursiveFindResult(
                [this.ownPeerDescriptor!],
                [this.ownPeerDescriptor!],
                data ? Array.from(data.values()) : [],
                true
            )
            return recursiveFindSession.getResults()
        }
        const routeMessage = this.wrapRecursiveFindRequest(idToFind, sessionId, findMode)
        this.ongoingSessions.set(sessionId, recursiveFindSession)
        try {
            await runAndWaitForEvents3<RecursiveFindSessionEvents>(
                [() => this.doFindRecursevily(routeMessage, excludedPeer)],
                [[recursiveFindSession, 'findCompleted']],
                15000
            )
        } catch (err) {
            logger.debug(`doFindRecursively failed with error ${this.ownPeerDescriptor.nodeName} ${err}`)
        }
        this.findAndReportLocalData(idToFind, findMode, [], this.ownPeerDescriptor, sessionId)
        this.ongoingSessions.delete(sessionId)
        recursiveFindSession.stop()
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
            serviceId: this.serviceId,
            body: {
                oneofKind: 'recursiveFindRequest',
                recursiveFindRequest: request
            }
        }
        const routeMessage: RouteMessageWrapper = {
            message: msg,
            requestId: v4(),
            destinationPeer: targetDescriptor,
            sourcePeer: this.ownPeerDescriptor,
            reachableThrough: [],
            routingPath: []
        }
        return routeMessage
    }

    private findAndReportLocalData(
        idToFind: Uint8Array,
        findMode: FindMode,
        routingPath: PeerDescriptor[],
        sourcePeer: PeerDescriptor,
        sessionId: string
    ): boolean {
        if (findMode === FindMode.DATA) {
            const data = this.localDataStore.getEntry(PeerID.fromValue(idToFind))
            if (data.size > 0) {
                this.reportRecursiveFindResult(routingPath, sourcePeer, sessionId, [], data, true)
                return true
            }
        }
        return false
    }

    private findLocalData(idToFind: Uint8Array, findMode: FindMode): Map<PeerIDKey, DataEntry> | undefined {
        if (findMode === FindMode.DATA) {
            return this.localDataStore.getEntry(PeerID.fromValue(idToFind))
        }
        return undefined
    }

    private reportRecursiveFindResult(
        routingPath: PeerDescriptor[],
        targetPeerDescriptor: PeerDescriptor,
        serviceId: string,
        closestNodes: PeerDescriptor[],
        data: Map<PeerIDKey, DataEntry> | undefined,
        noCloserNodesFound: boolean = false
    ): void {
        const dataEntries = data ? Array.from(data.values(), DataEntry.create.bind(DataEntry)) : []
        const isOwnPeerId = this.ownPeerId.equals(PeerID.fromValue(targetPeerDescriptor!.kademliaId))
        if (isOwnPeerId && this.ongoingSessions.has(serviceId)) {
            this.ongoingSessions.get(serviceId)!
                .doReportRecursiveFindResult(routingPath, closestNodes, dataEntries, noCloserNodesFound)
        } else if (!isOwnPeerId) {
            const remoteCommunicator = new ListeningRpcCommunicator(serviceId, this.sessionTransport, { rpcRequestTimeout: 15000 })
            const remoteSession = new RemoteRecursiveFindSession(
                this.ownPeerDescriptor,
                targetPeerDescriptor,
                toProtoRpcClient(new RecursiveFindSessionServiceClient(remoteCommunicator.getRpcClientTransport())),
                serviceId
            )
            remoteSession.reportRecursiveFindResult(routingPath, closestNodes, dataEntries, noCloserNodesFound)
        }
    }

    private doFindRecursevily(routedMessage: RouteMessageWrapper, excludedPeer?: PeerDescriptor): RouteMessageAck {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'DhtNode Stopped')
        }
        const idToFind = PeerID.fromValue(routedMessage.destinationPeer!.kademliaId)
        const msg = routedMessage.message
        const recursiveFindRequest = msg?.body.oneofKind === 'recursiveFindRequest' ? msg.body.recursiveFindRequest : undefined
        const closestPeersToDestination = this.getClosestPeerDescriptors(routedMessage.destinationPeer!.kademliaId, 5)
        const data = this.findLocalData(idToFind.value, recursiveFindRequest!.findMode)
        if (this.ownPeerId!.equals(idToFind)) {
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, data, true)
            return createRouteMessageAck(routedMessage)
        }
        const ack = this.router.doRouteMessage(routedMessage, RoutingMode.RECURSIVE_FIND, excludedPeer)
        if (ack.error === RoutingErrors.NO_CANDIDATES_FOUND) {
            logger.trace(`findRecursively Node ${this.ownPeerDescriptor.nodeName} found no candidates`)
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, data, true)
        } else if (ack.error) {
            return ack
        } else {
            const noCloserContactsFound = (
                closestPeersToDestination.length > 0
                && routedMessage.previousPeer
                && !this.isPeerCloserToIdThanSelf(closestPeersToDestination[0], idToFind)
            )
            this.reportRecursiveFindResult(routedMessage.routingPath, routedMessage.sourcePeer!, recursiveFindRequest!.recursiveFindSessionId,
                closestPeersToDestination, data, noCloserContactsFound)
        }
        return ack
    }

    // IRoutingService method
    async findRecursively(routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        if (this.stopped) {
            return createRouteMessageAck(routedMessage, 'findRecursively() service is not running')
        } else if (this.router.checkDuplicate(routedMessage.requestId)) {
            return createRouteMessageAck(routedMessage, 'message given to findRecursively() service is likely a duplicate')
        }
        const senderKey = keyFromPeerDescriptor(routedMessage.previousPeer || routedMessage.sourcePeer!)
        logger.trace(`Node ${this.ownPeerId.toKey()} received findRecursively call from ${senderKey}`)
        this.addContact(routedMessage.sourcePeer!, true)
        this.router!.addToDuplicateDetector(routedMessage.requestId, keyFromPeerDescriptor(routedMessage.sourcePeer!))
        return this.doFindRecursevily(routedMessage)
    }

    public stop(): void {
        this.stopped = true
        this.ongoingSessions.forEach((session, _id) => {
            session.stop()
        })
        this.ongoingSessions.clear()
    }
}
