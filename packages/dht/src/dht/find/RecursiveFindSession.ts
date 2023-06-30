import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { PeerID, PeerIDKey } from "../../helpers/PeerID"
import { DataEntry, FindMode, PeerDescriptor, RecursiveFindReport } from "../../proto/packages/dht/protos/DhtRpc"
import { IRecursiveFindSessionService } from "../../proto/packages/dht/protos/DhtRpc.server"
import { Empty } from "../../proto/google/protobuf/empty"
import { ITransport } from "../../transport/ITransport"
import { ListeningRpcCommunicator } from "../../transport/ListeningRpcCommunicator"
import { Contact } from "../contact/Contact"
import { SortedContactList } from "../contact/SortedContactList"
import { RecursiveFindResult } from "./RecursiveFinder"
import { keyFromPeerDescriptor } from '../../helpers/peerIdFromPeerDescriptor'

export interface RecursiveFindSessionEvents {
    findCompleted: (results: PeerDescriptor[]) => void
}

const logger = new Logger(module)

export interface RecursiveFindSessionConfig {
    serviceId: string
    rpcTransport: ITransport
    kademliaIdToFind: Uint8Array
    ownPeerID: PeerID
    waitedRoutingPathCompletions: number
    mode: FindMode
}

export class RecursiveFindSession extends EventEmitter<RecursiveFindSessionEvents> implements IRecursiveFindSessionService {
    private readonly serviceId: string
    private readonly rpcTransport: ITransport
    private readonly kademliaIdToFind: Uint8Array
    private readonly ownPeerID: PeerID
    private readonly waitedRoutingPathCompletions: number
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private readonly mode: FindMode
    private results: SortedContactList<Contact>
    private foundData: Map<string, DataEntry> = new Map()
    private allKnownHops: Set<PeerIDKey> = new Set()
    private reportedHops: Set<PeerIDKey> = new Set()
    private reportFindCompletedTimeout?: NodeJS.Timeout
    private findCompletedEmitted = false
    private noCloserNodesReceivedCounter = 0

    constructor(config: RecursiveFindSessionConfig) {
        super()
        this.serviceId = config.serviceId
        this.rpcTransport = config.rpcTransport
        this.kademliaIdToFind = config.kademliaIdToFind
        this.ownPeerID = config.ownPeerID
        this.waitedRoutingPathCompletions = config.waitedRoutingPathCompletions
        this.results = new SortedContactList(PeerID.fromValue(this.kademliaIdToFind), 10, undefined, true)
        this.mode = config.mode
        this.rpcCommunicator = new ListeningRpcCommunicator(this.serviceId, this.rpcTransport, {
            rpcRequestTimeout: 15000
        })
        this.rpcCommunicator.registerRpcNotification(RecursiveFindReport, 'reportRecursiveFindResult',
            (req: RecursiveFindReport, context) => this.reportRecursiveFindResult(req, context))
    }

    private isFindCompleted(): boolean {
        const unreportedHops: Set<PeerIDKey> = new Set(this.allKnownHops)
        this.reportedHops.forEach((id) => {
            unreportedHops.delete(id)
        })
        if (this.noCloserNodesReceivedCounter >= 1 && unreportedHops.size === 0) {
            if (this.mode === FindMode.DATA 
                && (this.hasNonStaleData() || this.noCloserNodesReceivedCounter >= this.waitedRoutingPathCompletions)) {
                return true
            } else if (this.mode === FindMode.DATA) {
                return false
            }
            return true
        }
        return false
    }

    private hasNonStaleData(): boolean {
        return Array.from(this.foundData.values()).some((entry) => entry.stale === false)
    }

    public doReportRecursiveFindResult(
        routingPath: PeerDescriptor[],
        nodes: PeerDescriptor[],
        dataEntries: DataEntry[],
        noCloserNodesFound?: boolean
    ): void {
        this.addKnownHops(routingPath)
        if (routingPath.length >= 1) {
            this.setHopAsReported(routingPath[routingPath.length - 1])
        }
        nodes.map((descriptor: PeerDescriptor) => {
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
            if (!this.ownPeerID.equals(newPeerId)) {
                this.allKnownHops.add(newPeerId.toKey())
            }
        })
    }

    private setHopAsReported(desc: PeerDescriptor) {
        const newPeerId = PeerID.fromValue(desc.kademliaId)
        if (!this.ownPeerID.equals(newPeerId)) {
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

    public async reportRecursiveFindResult(report: RecursiveFindReport, _context: ServerCallContext): Promise<Empty> {
        logger.trace('recursiveFindReport arrived: ' + JSON.stringify(report))
        this.doReportRecursiveFindResult(report.routingPath, report.nodes, report.dataEntries, report.noCloserNodesFound)
        return {}
    }

    public getResults = (): RecursiveFindResult => ({
        closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
        dataEntries: (this.foundData && this.foundData.size > 0) ? Array.from(this.foundData.values()) : undefined
    })

    public stop(): void {
        if (this.reportFindCompletedTimeout) {
            clearTimeout(this.reportFindCompletedTimeout)
            this.reportFindCompletedTimeout = undefined
        }
        this.emit('findCompleted', [])
    }
}
