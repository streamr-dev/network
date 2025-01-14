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
    Message
} from '../../../generated/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Contact } from '../contact/Contact'
import { SortedContactList } from '../contact/SortedContactList'
import { RecursiveOperationResult } from './RecursiveOperationManager'
import { ServiceID } from '../../types/ServiceID'
import { RecursiveOperationSessionRpcLocal } from './RecursiveOperationSessionRpcLocal'
import { DhtAddress, toDhtAddress, toNodeId, toDhtAddressRaw } from '../../identifiers'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export interface RecursiveOperationSessionEvents {
    completed: () => void
}

export const RECURSIVE_OPERATION_TIMEOUT = 10 * 1000

export interface RecursiveOperationSessionOptions {
    transport: ITransport
    targetId: DhtAddress
    localPeerDescriptor: PeerDescriptor
    waitedRoutingPathCompletions: number
    operation: RecursiveOperation
    doRouteRequest: (routedMessage: RouteMessageWrapper) => RouteMessageAck
}

export class RecursiveOperationSession extends EventEmitter<RecursiveOperationSessionEvents> {
    private readonly id = v4()
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private results: SortedContactList<Contact>
    private foundData: Map<DhtAddress, DataEntry> = new Map()
    private allKnownHops: Set<DhtAddress> = new Set()
    private reportedHops: Set<DhtAddress> = new Set()
    private timeoutTask?: NodeJS.Timeout
    private completionEventEmitted = false
    private noCloserNodesReceivedCounter = 0
    private readonly noCloserNodesReceivedFrom: Set<DhtAddress> = new Set()
    private readonly options: RecursiveOperationSessionOptions

    constructor(options: RecursiveOperationSessionOptions) {
        super()
        this.options = options
        this.results = new SortedContactList({
            referenceId: options.targetId,
            maxSize: 10, // TODO use options option or named constant?
            allowToContainReferenceId: true
        })
        this.rpcCommunicator = new ListeningRpcCommunicator(this.id, options.transport, {
            rpcRequestTimeout: RECURSIVE_OPERATION_TIMEOUT
        })
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RecursiveOperationSessionRpcLocal({
            onResponseReceived: (
                remoteNodeId: DhtAddress,
                routingPath: PeerDescriptor[],
                closestConnectedNodes: PeerDescriptor[],
                dataEntries: DataEntry[],
                noCloserNodesFound: boolean
            ) => {
                this.onResponseReceived(
                    remoteNodeId,
                    routingPath,
                    closestConnectedNodes,
                    dataEntries,
                    noCloserNodesFound
                )
            }
        })
        this.rpcCommunicator.registerRpcNotification(
            RecursiveOperationResponse,
            'sendResponse',
            (req: RecursiveOperationResponse, context: ServerCallContext) => rpcLocal.sendResponse(req, context)
        )
    }

    public start(serviceId: ServiceID): void {
        const routeMessage = this.wrapRequest(serviceId)
        this.options.doRouteRequest(routeMessage)
    }

    private wrapRequest(serviceId: ServiceID): RouteMessageWrapper {
        const request: RecursiveOperationRequest = {
            sessionId: this.getId(),
            operation: this.options.operation
        }
        const msg: Message = {
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
            target: toDhtAddressRaw(this.options.targetId),
            sourcePeer: this.options.localPeerDescriptor,
            reachableThrough: [],
            routingPath: [],
            parallelRootNodeIds: []
        }
        return routeMessage
    }

    private isCompleted(): boolean {
        const unreportedHops: Set<DhtAddress> = new Set(this.allKnownHops)
        this.reportedHops.forEach((id) => {
            unreportedHops.delete(id)
        })
        if (this.noCloserNodesReceivedCounter >= 1 && unreportedHops.size === 0) {
            if (
                this.options.operation === RecursiveOperation.FETCH_DATA &&
                (this.hasNonStaleData() ||
                    this.noCloserNodesReceivedCounter >= this.options.waitedRoutingPathCompletions)
            ) {
                return true
            } else if (this.options.operation === RecursiveOperation.FETCH_DATA) {
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
        remoteNodeId: DhtAddress,
        routingPath: PeerDescriptor[],
        closestConnectedNodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound: boolean
    ): void {
        this.addKnownHops(routingPath)
        if (routingPath.length >= 1) {
            this.setHopAsReported(routingPath[routingPath.length - 1])
        }
        closestConnectedNodes.forEach((descriptor: PeerDescriptor) => {
            this.results.addContact(new Contact(descriptor))
        })
        this.processFoundData(dataEntries)
        if (noCloserNodesFound || this.noCloserNodesReceivedFrom.has(remoteNodeId)) {
            this.onNoCloserPeersFound(remoteNodeId)
        }
    }

    private addKnownHops(routingPath: PeerDescriptor[]) {
        const localNodeId = toNodeId(this.options.localPeerDescriptor)
        routingPath.forEach((desc) => {
            const newNodeId = toNodeId(desc)
            if (localNodeId !== newNodeId) {
                this.allKnownHops.add(newNodeId)
            }
        })
    }

    private setHopAsReported(desc: PeerDescriptor) {
        const localNodeId = toNodeId(this.options.localPeerDescriptor)
        const newNodeId = toNodeId(desc)
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
            const creatorNodeId = toDhtAddress(entry.creator)
            const existingEntry = this.foundData.get(creatorNodeId)
            if (
                !existingEntry ||
                existingEntry.createdAt! < entry.createdAt! ||
                (existingEntry.createdAt! <= entry.createdAt! && entry.deleted)
            ) {
                this.foundData.set(creatorNodeId, entry)
            }
        })
    }

    private onNoCloserPeersFound(remoteNodeId: DhtAddress): void {
        this.noCloserNodesReceivedCounter += 1
        this.noCloserNodesReceivedFrom.add(remoteNodeId)
        if (this.isCompleted()) {
            this.emit('completed')
            this.completionEventEmitted = true
            if (this.timeoutTask) {
                clearTimeout(this.timeoutTask)
                this.timeoutTask = undefined
            }
        } else if (!this.timeoutTask && !this.completionEventEmitted) {
            this.timeoutTask = setTimeout(() => {
                if (!this.completionEventEmitted) {
                    this.emit('completed')
                    this.completionEventEmitted = true
                }
            }, 4000) // TODO use options option or named constant?
        }
    }

    public getResults(): RecursiveOperationResult {
        return {
            closestNodes: this.results.getClosestContacts().map((contact) => contact.getPeerDescriptor()),
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
