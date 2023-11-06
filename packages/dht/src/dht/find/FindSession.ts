import { Logger } from '@streamr/utils'
import EventEmitter from 'eventemitter3'
import { PeerID, PeerIDKey } from '../../helpers/PeerID'
import { DataEntry, PeerDescriptor, FindResponse } from '../../proto/packages/dht/protos/DhtRpc'
import { IFindSessionRpc } from '../../proto/packages/dht/protos/DhtRpc.server'
import { Empty } from '../../proto/google/protobuf/empty'
import { ITransport } from '../../transport/ITransport'
import { ListeningRpcCommunicator } from '../../transport/ListeningRpcCommunicator'
import { Contact } from '../contact/Contact'
import { SortedContactList } from '../contact/SortedContactList'
import { FindResult } from './Finder'
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export interface FindSessionEvents {
    findCompleted: (results: PeerDescriptor[]) => void
}

const logger = new Logger(module)

export interface FindSessionConfig {
    serviceId: string
    transport: ITransport
    kademliaIdToFind: Uint8Array
    localPeerId: PeerID
    waitedRoutingPathCompletions: number
    fetchData: boolean
}

export class FindSession extends EventEmitter<FindSessionEvents> implements IFindSessionRpc {
    private readonly serviceId: string
    private readonly transport: ITransport
    private readonly kademliaIdToFind: Uint8Array
    private readonly localPeerId: PeerID
    private readonly waitedRoutingPathCompletions: number
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly fetchData: boolean
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
        this.fetchData = config.fetchData
        this.rpcCommunicator = new ListeningRpcCommunicator(this.serviceId, this.transport, {
            rpcRequestTimeout: 15000
        })
        this.rpcCommunicator.registerRpcNotification(FindResponse, 'sendFindResponse',
            (req: FindResponse) => this.sendFindResponse(req))
    }

    private isFindCompleted(): boolean {
        const unreportedHops: Set<PeerIDKey> = new Set(this.allKnownHops)
        this.reportedHops.forEach((id) => {
            unreportedHops.delete(id)
        })
        if (this.noCloserNodesReceivedCounter >= 1 && unreportedHops.size === 0) {
            if (this.fetchData
                && (this.hasNonStaleData() || this.noCloserNodesReceivedCounter >= this.waitedRoutingPathCompletions)) {
                return true
            } else if (this.fetchData) {
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
        noCloserNodesFound?: boolean
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
            const storerKey = keyFromPeerDescriptor(entry.storer!)
            const existingEntry = this.foundData.get(storerKey)
            if (!existingEntry || existingEntry.storerTime! < entry.storerTime! 
                || (existingEntry.storerTime! <= entry.storerTime! && entry.deleted)) {
                this.foundData.set(storerKey, entry)
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

    public async sendFindResponse(report: FindResponse): Promise<Empty> {
        logger.trace('FindResponse arrived: ' + JSON.stringify(report))
        this.doSendFindResponse(report.routingPath, report.closestConnectedPeers, report.dataEntries, report.noCloserNodesFound)
        return {}
    }

    public getResults = (): FindResult => ({
        closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
        dataEntries: (this.foundData && this.foundData.size > 0) ? Array.from(this.foundData.values()) : undefined
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
