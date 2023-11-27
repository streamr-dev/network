import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry, PeerDescriptor, FindResponse, FindAction } from '../../proto/packages/dht/protos/DhtRpc'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Contact } from '../contact/Contact'
import { SortedContactList } from '../contact/SortedContactList'
import { FindResult } from './Finder'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'
import { ServiceID } from '../../types/ServiceID'
import { FindSessionRpcLocal } from './FindSessionRpcLocal'

export interface FindSessionEvents {
    findCompleted: (results: PeerDescriptor[]) => void
}

export interface FindSessionConfig {
    serviceId: ServiceID
    transport: ITransport
    kademliaIdToFind: Uint8Array
    localPeerId: PeerID
    waitedRoutingPathCompletions: number
    action: FindAction
}

export class FindSession extends EventEmitter<FindSessionEvents> {
    private readonly serviceId: ServiceID
    private readonly transport: ITransport
    private readonly kademliaIdToFind: Uint8Array
    private readonly localPeerId: PeerID
    private readonly waitedRoutingPathCompletions: number
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly action: FindAction
    private results: SortedContactList<Contact>
    private foundData: Map<string, DataEntry> = new Map()
    private allKnownHops: Set<PeerIDKey> = new Set()
    private reportedHops: Set<PeerIDKey> = new Set()
    private reportFindCompletedTimeout?: NodeJS.Timeout
    private findCompletedEmitted = false
    private noCloserNodesReceivedCounter = 0

    constructor(config: FindSessionConfig) {
        super()
        this.serviceId = config.serviceId
        this.transport = config.transport
        this.kademliaIdToFind = config.kademliaIdToFind
        this.localPeerId = config.localPeerId
        this.waitedRoutingPathCompletions = config.waitedRoutingPathCompletions
        this.results = new SortedContactList(PeerID.fromValue(this.kademliaIdToFind), 10, undefined, true)
        this.action = config.action
        this.rpcCommunicator = new ListeningRpcCommunicator(this.serviceId, this.transport, {
            rpcRequestTimeout: 15000
        })
        this.registerLocalRpcMethods()
    }

    private registerLocalRpcMethods() {
        const rpcLocal = new FindSessionRpcLocal({
            doSendFindResponse: (routingPath: PeerDescriptor[], nodes: PeerDescriptor[], dataEntries: DataEntry[], noCloserNodesFound: boolean) => {
                this.doSendFindResponse(routingPath, nodes, dataEntries, noCloserNodesFound)
            }
        })
        this.rpcCommunicator.registerRpcNotification(FindResponse, 'sendFindResponse',
            (req: FindResponse) => rpcLocal.sendFindResponse(req))
    }

    private isFindCompleted(): boolean {
        const unreportedHops: Set<PeerIDKey> = new Set(this.allKnownHops)
        this.reportedHops.forEach((id) => {
            unreportedHops.delete(id)
        })
        if (this.noCloserNodesReceivedCounter >= 1 && unreportedHops.size === 0) {
            if (this.action === FindAction.FETCH_DATA
                && (this.hasNonStaleData() || this.noCloserNodesReceivedCounter >= this.waitedRoutingPathCompletions)) {
                return true
            } else if (this.action === FindAction.FETCH_DATA) {
                return false
            }
            return true
        }
        return false
    }

    private hasNonStaleData(): boolean {
        return Array.from(this.foundData.values()).some((entry) => entry.stale === false)
    }

    public doSendFindResponse(
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
            const newPeerId = PeerID.fromValue(desc.kademliaId)
            if (!this.localPeerId.equals(newPeerId)) {
                this.allKnownHops.add(newPeerId.toKey())
            }
        })
    }

    private setHopAsReported(desc: PeerDescriptor) {
        const newPeerId = PeerID.fromValue(desc.kademliaId)
        if (!this.localPeerId.equals(newPeerId)) {
            this.reportedHops.add(newPeerId.toKey())
        }
        if (this.isFindCompleted()) {
            if (!this.findCompletedEmitted && this.isFindCompleted()) {
                if (this.reportFindCompletedTimeout) {
                    clearTimeout(this.reportFindCompletedTimeout)
                    this.reportFindCompletedTimeout = undefined
                }
                this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                this.findCompletedEmitted = true
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
        if (this.isFindCompleted()) {
            this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
            this.findCompletedEmitted = true
            if (this.reportFindCompletedTimeout) {
                clearTimeout(this.reportFindCompletedTimeout)
                this.reportFindCompletedTimeout = undefined
            }
        } else {
            if (!this.reportFindCompletedTimeout && !this.findCompletedEmitted) {
                this.reportFindCompletedTimeout = setTimeout(() => {
                    if (!this.findCompletedEmitted) {
                        this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                        this.findCompletedEmitted = true
                    }
                }, 4000)
            }
        }
    }

    public getResults = (): FindResult => ({
        closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
        dataEntries: Array.from(this.foundData.values())
    })

    public stop(): void {
        if (this.reportFindCompletedTimeout) {
            clearTimeout(this.reportFindCompletedTimeout)
            this.reportFindCompletedTimeout = undefined
        }
        this.rpcCommunicator.destroy()
        this.emit('findCompleted', [])
    }
}
