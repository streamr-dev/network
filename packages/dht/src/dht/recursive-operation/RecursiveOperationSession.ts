import EventEmitter from 'eventemitter3'
import { v4 } from 'uuid'
import { 
    DataEntry,
    PeerDescriptor,
    RecursiveOperationResponse,
    RecursiveOperation,
    RouteMessageWrapper,
    RouteMessageAck,
    RecursiveOperationRequest,
    Message,
    MessageType
} from '../../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Contact } from '../contact/Contact'
import { SortedContactList } from '../contact/SortedContactList'
import { RecursiveOperationResult } from './RecursiveOperationManager'
import { getNodeIdFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ServiceID } from '../../types/ServiceID'
import { RecursiveOperationSessionRpcLocal } from './RecursiveOperationSessionRpcLocal'
import { DataKey, NodeID, getNodeIdFromRaw } from '../../identifiers'
import { hexToBinary } from '@streamr/utils'

export interface RecursiveOperationSessionEvents {
    completed: () => void
}

export interface RecursiveOperationSessionConfig {
    transport: ITransport
    targetId: NodeID | DataKey
    localPeerDescriptor: PeerDescriptor
    waitedRoutingPathCompletions: number
    operation: RecursiveOperation
    doRouteRequest: (routedMessage: RouteMessageWrapper) => RouteMessageAck
}

export class RecursiveOperationSession extends EventEmitter<RecursiveOperationSessionEvents> {

    private readonly id = v4()
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private results: SortedContactList<Contact>
    private foundData: Map<NodeID, DataEntry> = new Map()
    private allKnownHops: Set<NodeID> = new Set()
    private reportedHops: Set<NodeID> = new Set()
    private timeoutTask?: NodeJS.Timeout 
    private completionEventEmitted = false
    private noCloserNodesReceivedCounter = 0
    private readonly config: RecursiveOperationSessionConfig

    constructor(config: RecursiveOperationSessionConfig) {
        super()
        this.config = config
        this.results = new SortedContactList({
            referenceId: config.targetId, 
            maxSize: 10,  // TODO use config option or named constant?
            allowToContainReferenceId: true,
            emitEvents: false
        })
        this.rpcCommunicator = new ListeningRpcCommunicator(this.id, config.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
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

    public start(serviceId: ServiceID): void {
        const routeMessage = this.wrapRequest(serviceId)
        this.config.doRouteRequest(routeMessage)
    }

    private wrapRequest(serviceId: ServiceID): RouteMessageWrapper {
        const request: RecursiveOperationRequest = {
            sessionId: this.getId(),
            operation: this.config.operation
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
            target: hexToBinary(this.config.targetId),
            sourcePeer: this.config.localPeerDescriptor,
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
            if (this.config.operation === RecursiveOperation.FETCH_DATA
                && (this.hasNonStaleData() || this.noCloserNodesReceivedCounter >= this.config.waitedRoutingPathCompletions)) {
                return true
            } else if (this.config.operation === RecursiveOperation.FETCH_DATA) {
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
        const localNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        routingPath.forEach((desc) => {
            const newNodeId = getNodeIdFromPeerDescriptor(desc)
            if (localNodeId !== newNodeId) {
                this.allKnownHops.add(newNodeId)
            }
        })
    }

    private setHopAsReported(desc: PeerDescriptor) {
        const localNodeId = getNodeIdFromPeerDescriptor(this.config.localPeerDescriptor)
        const newNodeId = getNodeIdFromPeerDescriptor(desc)
        if (localNodeId !== newNodeId) {
            this.reportedHops.add(newNodeId)
        }
        if (this.isCompleted()) {
            if (!this.completionEventEmitted && this.isCompleted()) {
                if (this.timeoutTask) {
                    clearTimeout(this.timeoutTask)
                    this.timeoutTask = undefined
                }
                this.emit('completed')
                this.completionEventEmitted = true
            }
        }
    }

    private processFoundData(dataEntries: DataEntry[]): void {
        dataEntries.forEach((entry) => {
            const creatorNodeId = getNodeIdFromRaw(entry.creator)
            const existingEntry = this.foundData.get(creatorNodeId)
            if (!existingEntry || existingEntry.createdAt! < entry.createdAt! 
                || (existingEntry.createdAt! <= entry.createdAt! && entry.deleted)) {
                this.foundData.set(creatorNodeId, entry)
            }
        })
    }

    private onNoCloserPeersFound(): void {
        this.noCloserNodesReceivedCounter += 1
        if (this.isCompleted()) {
            this.emit('completed')
            this.completionEventEmitted = true
            if (this.timeoutTask) {
                clearTimeout(this.timeoutTask)
                this.timeoutTask = undefined
            }
        } else {
            if (!this.timeoutTask && !this.completionEventEmitted) {
                this.timeoutTask = setTimeout(() => {
                    if (!this.completionEventEmitted) {
                        this.emit('completed')
                        this.completionEventEmitted = true
                    }
                }, 4000)  // TODO use config option or named constant?
            }
        }
    }

    public getResults(): RecursiveOperationResult {
        return {
            closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
            dataEntries: Array.from(this.foundData.values())
        }
    }

    public getId(): string {
        return this.id
    }

    public stop(): void {
        if (this.timeoutTask) {
            clearTimeout(this.timeoutTask)
            this.timeoutTask = undefined
        }
        this.rpcCommunicator.destroy()
        this.emit('completed')
    }
}
