import { NodeId } from '../../identifiers'
import { Receipt } from 'streamr-client-protocol'

function store(key: string, receipt: Receipt, map: Map<string, Set<Receipt>>): void {
    if (!map.has(key)) {
        map.set(key, new Set<Receipt>())
    }
    map.get(key)!.add(receipt)
}

export class ReceiptStore {
    private readonly myReceipts = new Map<NodeId, Set<Receipt>>()
    private readonly theirReceipts = new Map<NodeId, Set<Receipt>>()
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

    getTheirReceipts(nodeId: NodeId): ReadonlySet<Receipt> {
        return this.theirReceipts.get(nodeId) ?? new Set<Receipt>()
    }
}
