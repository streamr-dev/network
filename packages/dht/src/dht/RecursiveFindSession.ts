import { ServerCallContext } from "@protobuf-ts/runtime-rpc"
import { Logger } from "@streamr/utils"
import EventEmitter from "eventemitter3"
import { PeerID } from "../helpers/PeerID"
import { DataEntry, PeerDescriptor, RecursiveFindReport } from "../proto/packages/dht/protos/DhtRpc"
import { IRecursiveFindSessionService } from "../proto/packages/dht/protos/DhtRpc.server"
import { Empty } from "../proto/google/protobuf/empty"
import { ITransport } from "../transport/ITransport"
import { ListeningRpcCommunicator } from "../transport/ListeningRpcCommunicator"
import { Contact } from "./contact/Contact"
import { SortedContactList } from "./contact/SortedContactList"
import { RecursiveFindResult } from "./DhtNode"

export interface RecursiveFindSessionEvents {
    findCompleted: (results: PeerDescriptor[]) => void
}

const logger = new Logger(module)

export class RecursiveFindSession extends EventEmitter<RecursiveFindSessionEvents> implements IRecursiveFindSessionService {
    private readonly rpcCommunicator: ListeningRpcCommunicator
    private results: SortedContactList<Contact>
    private foundData: Array<DataEntry> = []

    private readonly rpcTransport: ITransport

    constructor(serviceId: string, rpcTransport: ITransport, kademliaIdToFind: Uint8Array) {
        super()

        this.rpcTransport = rpcTransport
        this.results = new SortedContactList(PeerID.fromValue(kademliaIdToFind), 10)

        this.rpcCommunicator = new ListeningRpcCommunicator(serviceId, this.rpcTransport, {
            rpcRequestTimeout: 15000
        })

        this.reportRecursiveFindResult = this.reportRecursiveFindResult.bind(this)
        this.rpcCommunicator.registerRpcNotification(RecursiveFindReport, 'reportRecursiveFindResult', this.reportRecursiveFindResult)

    }

    public async reportRecursiveFindResult(report: RecursiveFindReport, _context: ServerCallContext): Promise<Empty> {
        logger.trace('recursiveFindReport arrived: ' + JSON.stringify(report))
        report.nodes.map((descriptor: PeerDescriptor) => {
            this.results.addContact(new Contact(descriptor))
        })

        if (report.dataEntries && report.dataEntries.length > 0) {
            report.dataEntries.forEach((entry) => {
                this.foundData.push(entry)
            })
        }

        if (report.noCloserNodesFound) {
            this.emit('findCompleted', this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()))
        }
        return {}
    }

    public getResults(): RecursiveFindResult {
        const ret = {
            closestNodes: this.results.getAllContacts().map((contact) => contact.getPeerDescriptor()),
            dataEntries: (this.foundData && this.foundData.length > 0) ? this.foundData : undefined
        }

        return ret
    }
}
