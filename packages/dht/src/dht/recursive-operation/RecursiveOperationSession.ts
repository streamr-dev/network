import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { DataEntry, PeerDescriptor, RecursiveOperationResponse, RecursiveOperation, RouteMessageWrapper, RouteMessageAck, NodeType, RecursiveOperationRequest, Message, MessageType } from '../../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Contact } from '../contact/Contact'
import { SortedContactList } from '../contact/SortedContactList'
import { RecursiveOperationResult } from './RecursiveOperationManager'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ServiceID } from '../../types/ServiceID'
import { RecursiveOperationSessionRpcLocal } from './RecursiveOperationSessionRpcLocal'
import { NodeID, areEqualNodeIds, getNodeIdFromBinary } from '../../helpers/nodeId'

export interface RecursiveOperationSessionEvents {
    completed: (results: PeerDescriptor[]) => void
}

export interface RecursiveOperationSessionConfig {
    transport: ITransport
    targetId: Uint8Array
    localPeerDescriptor: PeerDescriptor
    waitedRoutingPathCompletions: number
    operation: RecursiveOperation
    doRouteRequest: (routedMessage: RouteMessageWrapper) => RouteMessageAck
}

export class RecursiveOperationSession extends EventEmitter<RecursiveOperationSessionEvents> {

    private readonly id = v4()
    private readonly transport: ITransport
    private readonly targetId: Uint8Array
    private readonly localPeerDescriptor: PeerDescriptor
    private readonly waitedRoutingPathCompletions: number
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly operation: RecursiveOperation
    private results: SortedContactList<Contact>
    private foundData: Map<NodeID, DataEntry> = new Map()
    private allKnownHops: Set<NodeID> = new Set()
    private reportedHops: Set<NodeID> = new Set()
    private timeoutTask?: NodeJS.Timeout 
    private completionEventEmitted = false
    private noCloserNodesReceivedCounter = 0
    private doRouteRequest: (routedMessage: RouteMessageWrapper) => RouteMessageAck

    constructor(config: RecursiveOperationSessionConfig) {
        super()
        this.transport = config.transport
        this.targetId = config.targetId
        this.localPeerDescriptor = config.localPeerDescriptor
        this.waitedRoutingPathCompletions = config.waitedRoutingPathCompletions
        this.results = new SortedContactList({
            referenceId: getNodeIdFromBinary(this.targetId), 
            maxSize: 10,  // TODO use config option or named constant?
            allowToContainReferenceId: true,
            emitEvents: false
        })
        this.operation = config.operation
        this.rpcCommunicator = new ListeningRpcCommunicator(this.id, this.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
        this.doRouteRequest = config.doRouteRequest
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RecursiveOperationSessionRpcLocal({
            onResponseReceived: (routingPath: PeerDescriptor[], nodes: PeerDescriptor[], dataEntries: DataEntry[], noCloserNodesFound: boolean) => {
                this.onResponseReceived(routingPath, nodes, dataEntries, noCloserNodesFound)
            }
        })
        this.rpcCommunicator.registerRpcNotification(RecursiveOperationResponse, 'sendResponse',
            (req: RecursiveOperationResponse) => rpcLocal.sendResponse(req))
    }

    // TODO why we use serviceId of RecursiveOperationManager? (could we use this.id,
    // i.e. the same service we use when we create ListeningRpcCommunicator in this class)
    public start(serviceId: ServiceID): void {
        const routeMessage = this.wrapRequest(serviceId)
        this.doRouteRequest(routeMessage)
    }

    private wrapRequest(serviceId: ServiceID): RouteMessageWrapper {
        const targetDescriptor: PeerDescriptor = {
            nodeId: this.targetId,
            type: NodeType.VIRTUAL
        }
        const request: RecursiveOperationRequest = {
            sessionId: this.getId(),
            operation: this.operation
        }
        const msg: Message = {
            messageType: MessageType.RECURSIVE_OPERATION_REQUEST,
            messageId: v4(),
            serviceId,
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

    private isCompleted(): boolean {
        const unreportedHops: Set<NodeID> = new Set(this.allKnownHops)
        this.reportedHops.forEach((id) => {
            unreportedHops.delete(id)
        })
        if (this.noCloserNodesReceivedCounter >= 1 && unreportedHops.size === 0) {
            if (this.operation === RecursiveOperation.FETCH_DATA
                && (this.hasNonStaleData() || this.noCloserNodesReceivedCounter >= this.waitedRoutingPathCompletions)) {
                return true
            } else if (this.operation === RecursiveOperation.FETCH_DATA) {
                return false
            }
            return true
        }
        return false
    }

    private hasNonStaleData(): boolean {
        return Array.from(this.foundData.values()).some((entry) => entry.stale === false)
    }

    public onResponseReceived(
        routingPath: PeerDescriptor[],
        nodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ): void {
        this.addKnownHops(routingPath)
        if (routingPath.length >= 1) {
            this.setHopAsReported(routingPath[routingPath.length - 1])
        }
        nodes.forEach((descriptor: PeerDescriptor) => {
            this.results.addContact(new Contact(descriptor))
        })
        this.processFoundData(dataEntries)
        if (noCloserNodesFound) {
            this.onNoCloserPeersFound()
        }
    }

    private addKnownHops(routingPath: PeerDescriptor[]) {
        const localNodeId = getNodeIdFromPeerDescriptor(this.localPeerDescriptor)
        routingPath.forEach((desc) => {
            const newNodeId = getNodeIdFromPeerDescriptor(desc)
            if (!areEqualNodeIds(localNodeId, newNodeId)) {
                this.allKnownHops.add(newNodeId)
            }
        })
    }

    private setHopAsReported(desc: PeerDescriptor) {
        const localNodeId = getNodeIdFromPeerDescriptor(this.localPeerDescriptor)
        const newNodeId = getNodeIdFromPeerDescriptor(desc)
        if (!areEqualNodeIds(localNodeId, newNodeId)) {
            this.reportedHops.add(newNodeId)
        }
        if (this.isCompleted()) {
            if (!this.completionEventEmitted && this.isCompleted()) {
                if (this.timeoutTask) {
                    clearTimeout(this.timeoutTask)
                    this.timeoutTask = undefined
                }
                this.emit('completed', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                this.completionEventEmitted = true
            }
        }
    }

    private processFoundData(dataEntries: DataEntry[]): void {
        dataEntries.forEach((entry) => {
            const creatorKey = getNodeIdFromPeerDescriptor(entry.creator!)
            const existingEntry = this.foundData.get(creatorKey)
            if (!existingEntry || existingEntry.createdAt! < entry.createdAt! 
                || (existingEntry.createdAt! <= entry.createdAt! && entry.deleted)) {
                this.foundData.set(creatorKey, entry)
            }
        })
    }

    private onNoCloserPeersFound(): void {
        this.noCloserNodesReceivedCounter += 1
        if (this.isCompleted()) {
            this.emit('completed', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
            this.completionEventEmitted = true
            if (this.timeoutTask) {
                clearTimeout(this.timeoutTask)
                this.timeoutTask = undefined
            }
        } else {
            if (!this.timeoutTask && !this.completionEventEmitted) {
                this.timeoutTask = setTimeout(() => {
                    if (!this.completionEventEmitted) {
                        this.emit('completed', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                        this.completionEventEmitted = true
                    }
                }, 4000)  // TODO use config option or named constant?
            }
        }
    }

    public getResults = (): RecursiveOperationResult => ({
        closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
        dataEntries: Array.from(this.foundData.values())
    })

    public getId() {
        return this.id
    }

    public stop(): void {
        if (this.timeoutTask) {
            clearTimeout(this.timeoutTask)
            this.timeoutTask = undefined
        }
        this.rpcCommunicator.destroy()
        this.emit('completed', [])
    }
}
