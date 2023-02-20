/* eslint-disable @typescript-eslint/parameter-properties */

import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { PeerID, PeerIDKey } from "../helpers/PeerID"
import { DataEntry, PeerDescriptor, RecursiveFindReport } from "../proto/packages/dht/protos/DhtRpc"
import { IRecursiveFindSessionService } from "../proto/packages/dht/protos/DhtRpc.server"
import { Empty } from "../proto/google/protobuf/empty"
import { ITransport } from "../transport/ITransport"
import { ListeningRpcCommunicator } from "../transport/ListeningRpcCommunicator"
import { Contact } from "./contact/Contact"
import { SortedContactList } from "./contact/SortedContactList"
import { RecursiveFindResult } from "./DhtNode"
import { keyFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'

export interface RecursiveFindSessionEvents {
    findCompleted: (results: PeerDescriptor[]) => void
}

const logger = new Logger(module)

export class RecursiveFindSession extends EventEmitter<RecursiveFindSessionEvents> implements IRecursiveFindSessionService {
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private results: SortedContactList<Contact>
    private foundData: Map<string, DataEntry> = new Map()

    private readonly rpcTransport: ITransport

    private allKnownHops: Set<PeerIDKey> = new Set()
    private reportedHops: Set<PeerIDKey> = new Set()
    private reportFindCompletedTimeout?: NodeJS.Timeout
    private findCompletedEmitted = false

    private noCloserNodesReceived = false

    constructor(serviceId: string, rpcTransport: ITransport, kademliaIdToFind: Uint8Array, private ownPeerID: PeerID) {
        super()

        this.rpcTransport = rpcTransport
        this.results = new SortedContactList(PeerID.fromValue(kademliaIdToFind), 10)

        this.rpcCommunicator = new ListeningRpcCommunicator(serviceId, this.rpcTransport, {
            rpcRequestTimeout: 15000
        })

        this.reportRecursiveFindResult = this.reportRecursiveFindResult.bind(this)
        this.rpcCommunicator.registerRpcNotification(RecursiveFindReport, 'reportRecursiveFindResult', this.reportRecursiveFindResult)

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
                }
                this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                this.findCompletedEmitted = true
            }
        }
    }

    private isFindCompleted(): boolean {
        const unreportedHops: Set<PeerIDKey> = new Set(this.allKnownHops)
        this.reportedHops.forEach((id) => {
            unreportedHops.delete(id)
        })

        if (this.noCloserNodesReceived && unreportedHops.size == 0) {
            return true
        }
        return false
    }

    public doReportRecursiveFindResult(routingPath: PeerDescriptor[], nodes: PeerDescriptor[],
        dataEntries: DataEntry[], noCloserNodesFound?: boolean): void {

        this.addKnownHops(routingPath)

        if (routingPath.length >= 1) {
            this.setHopAsReported(routingPath[routingPath.length - 1])
        }

        nodes.map((descriptor: PeerDescriptor) => {
            this.results.addContact(new Contact(descriptor))
        })

        if (dataEntries) {
            dataEntries.forEach((entry) => {
                const storerKey = keyFromPeerDescriptor(entry.storer!)
                if (!this.foundData.has(storerKey)) {
                    this.foundData.set(storerKey, entry)
                } else if (this.foundData.has(storerKey) && this.foundData.get(storerKey)!.storedAt! < entry.storedAt!) {
                    this.foundData.set(storerKey, entry)
                }
            })
        }

        if (noCloserNodesFound) {
            this.noCloserNodesReceived = true

            if (this.isFindCompleted()) {
                this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                this.findCompletedEmitted = true
            } else {
                this.reportFindCompletedTimeout = setTimeout(() => {
                    if (!this.findCompletedEmitted) {
                        this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
                        this.findCompletedEmitted = true
                    }
                }, 5000)
            }
        }
    }

    public async reportRecursiveFindResult(report: RecursiveFindReport, _context: ServerCallContext): Promise<Empty> {

        logger.trace('recursiveFindReport arrived: ' + JSON.stringify(report))

        this.doReportRecursiveFindResult(report.routingPath, report.nodes, report.dataEntries, report.noCloserNodesFound)

        return {}
    }

    public getResults(): RecursiveFindResult {
        const ret = {
            closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
            dataEntries: (this.foundData && this.foundData.size > 0) ? Array.from(this.foundData.values()) : undefined
        }
        return ret
    }

    public stop(): void {
        this.emit('findCompleted', [])
    }
}
