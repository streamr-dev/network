import { NodeId } from '../../identifiers'
import { Receipt } from 'streamr-client-protocol'

function store(key: string, receipt: Receipt, map: Map<string, Receipt[]>): void {
    if (!map.has(key)) {
        map.set(key, [])
    }
    map.get(key)!.push(receipt)
}

export class ReceiptStore {
    private readonly myReceipts = new Map<NodeId, Receipt[]>()
    private readonly theirReceipts = new Map<NodeId, Receipt[]>()
    private readonly myId: NodeId

    constructor(myId: NodeId) {
        this.myId = myId
    }

    store(receipt: Receipt): void {
        if (receipt.claim.sender === this.myId) {
            store(receipt.claim.sender, receipt, this.myReceipts)
        } else {
            store(receipt.claim.receiver, receipt, this.theirReceipts)
        }
    }

    getTheirReceipts(nodeId: NodeId): ReadonlyArray<Receipt> {
        return this.theirReceipts.get(nodeId) ?? []
    }
}
