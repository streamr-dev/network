import { DhtAddress, PeerDescriptor } from "@streamr/dht"
import { ContentDeliveryRpcRemote } from "./ContentDeliveryRpcRemote"
import { NodeList } from "./NodeList"
import { EventEmitter } from "eventemitter3"

export interface NeighborEvents {
    bufferedAmountChanged: () => void
}

export class Neighbor extends ContentDeliveryRpcRemote {
    private bufferedAmount = 0
    public readonly emitter = new EventEmitter<NeighborEvents>()
    
    setBufferedAmount(bufferedAmount: number): void {
        if (bufferedAmount != this.bufferedAmount) {
            this.bufferedAmount = bufferedAmount
            this.emitter.emit('bufferedAmountChanged')
        }
    }

    getBufferedAmount(): number {
        return this.bufferedAmount
    }
}

export interface NeighborListEvents {
    neighborListChanged: (neighbors: Neighbor[]) => void
}

export class NeighborList extends NodeList<Neighbor> {
    public readonly emitter = new EventEmitter<NeighborListEvents>()
    constructor(ownId: DhtAddress, limit: number) {
        super(ownId, limit)
        super.on('nodeAdded', (_node) => {
            this.emitter.emit('neighborListChanged', this.getAll())
        })
        super.on('nodeRemoved', (_node) => {
            this.emitter.emit('neighborListChanged', this.getAll())
        })
    }

    add(neighbor: Neighbor): void {
        super.add(neighbor)
        neighbor.emitter.on('bufferedAmountChanged', () => {
            this.emitter.emit('neighborListChanged', this.getAll())
        })
    }
}
