import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry, PeerDescriptor, RecursiveOperationResponse, RecursiveOperation } from '../../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Contact } from '../contact/Contact'
import { SortedContactList } from '../contact/SortedContactList'
import { RecursiveOperationResult } from './RecursiveOperationManager'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ServiceID } from '../../types/ServiceID'
import { RecursiveOperationSessionRpcLocal } from './RecursiveOperationSessionRpcLocal'
import { getNodeIdFromBinary } from '../../helpers/nodeId'

export interface RecursiveOperationSessionEvents {
    completed: (results: PeerDescriptor[]) => void
}

export interface RecursiveOperationSessionConfig {
    serviceId: ServiceID
    transport: ITransport
    targetId: Uint8Array
    localPeerId: PeerID
    waitedRoutingPathCompletions: number
    operation: RecursiveOperation
}

export class RecursiveOperationSession extends EventEmitter<RecursiveOperationSessionEvents> {
    private readonly serviceId: ServiceID
    private readonly transport: ITransport
    private readonly targetId: Uint8Array
    private readonly localPeerId: PeerID
    private readonly waitedRoutingPathCompletions: number
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly operation: RecursiveOperation
    private results: SortedContactList<Contact>
    private foundData: Map<PeerIDKey, DataEntry> = new Map()
    private allKnownHops: Set<PeerIDKey> = new Set()
    private reportedHops: Set<PeerIDKey> = new Set()
    private timeoutTask?: NodeJS.Timeout 
    private completionEventEmitted = false
    private noCloserNodesReceivedCounter = 0

    constructor(config: RecursiveOperationSessionConfig) {
        super()
        this.serviceId = config.serviceId
        this.transport = config.transport
        this.targetId = config.targetId
        this.localPeerId = config.localPeerId
        this.waitedRoutingPathCompletions = config.waitedRoutingPathCompletions
        this.results = new SortedContactList({
            referenceId: getNodeIdFromBinary(this.targetId), 
            maxSize: 10,  // TODO use config option or named constant?
            allowToContainReferenceId: true,
            emitEvents: false
        })
        this.operation = config.operation
        this.rpcCommunicator = new ListeningRpcCommunicator(this.serviceId, this.transport, {
            rpcRequestTimeout: 15000  // TODO use config option or named constant?
        })
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new RecursiveOperationSessionRpcLocal({
            doSendResponse: (routingPath: PeerDescriptor[], nodes: PeerDescriptor[], dataEntries: DataEntry[], noCloserNodesFound: boolean) => {
                this.doSendResponse(routingPath, nodes, dataEntries, noCloserNodesFound)
            }
        })
        this.rpcCommunicator.registerRpcNotification(RecursiveOperationResponse, 'sendResponse',
            (req: RecursiveOperationResponse) => rpcLocal.sendResponse(req))
    }

    private isCompleted(): boolean {
        const unreportedHops: Set<PeerIDKey> = new Set(this.allKnownHops)
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

    public doSendResponse(
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
        routingPath.forEach((desc) => {
            const newPeerId = PeerID.fromValue(desc.nodeId)
            if (!this.localPeerId.equals(newPeerId)) {
                this.allKnownHops.add(newPeerId.toKey())
            }
        })
    }

    private setHopAsReported(desc: PeerDescriptor) {
        const newPeerId = PeerID.fromValue(desc.nodeId)
        if (!this.localPeerId.equals(newPeerId)) {
            this.reportedHops.add(newPeerId.toKey())
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
            const creatorKey = keyFromPeerDescriptor(entry.creator!)
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

    public stop(): void {
        if (this.timeoutTask) {
            clearTimeout(this.timeoutTask)
            this.timeoutTask = undefined
        }
        this.rpcCommunicator.destroy()
        this.emit('completed', [])
    }
}
