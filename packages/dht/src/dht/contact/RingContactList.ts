import { PeerDescriptor } from "../../proto/packages/dht/protos/DhtRpc";
import { OrderedMap } from "@js-sdsl/ordered-map"

type RingId = number & { __ringId: never }
type RingDistance = number & { __ringDistance: never }

export class PeerDescriptorDecorator {

    private readonly _parent: PeerDescriptor
    private readonly _ringId: RingId

    constructor(private readonly parent: PeerDescriptor) {
        this._parent = parent

        const regionAsBuffer = Buffer.alloc(4)
        regionAsBuffer.writeUInt32BE(this._parent.region!, 0)
        const ipAsbuffer = Buffer.alloc(4)
        ipAsbuffer.writeUInt32BE(this._parent.ipAddress!, 0)
        const keyAsBuffer = Buffer.from(this._parent.nodeId.subarray(this._parent.nodeId.length - 7, this._parent.nodeId.length))

        //console.log('key: ' + keyAsBuffer.toString('hex'))

        const arr = [
            regionAsBuffer,
            ipAsbuffer,
            keyAsBuffer
        ]
        const buffer = Buffer.concat(arr)
        //console.log('buffer: ' + buffer.toString('hex'))
        this._ringId = Number(this.uint8ArrayToBigInt(buffer)) as RingId
        //console.log('bigInt: ' + this.uint8ArrayToBigInt(buffer).toString(16))
        //console.log('ringId: ' + this._ringId.toString(16))
    }

    private uint8ArrayToBigInt(uint8Array: Uint8Array): BigInt {
        return uint8Array.reduce((acc, val) => (acc << BigInt(8)) | BigInt(val), BigInt(0));
    }

    public getRingId(): RingId {
        return this._ringId
    }

}

export class RingContactList<C extends { getPeerDescriptor(): PeerDescriptor }> {

    private readonly ringSize = 2 ** 120 - 1   // 2^120 - 1
    private readonly numNeighborsPerSide = 2
    private readonly referenceId: RingId
    private readonly leftNeighbors: OrderedMap<RingDistance, C>
    private readonly rightNeighbors: OrderedMap<RingDistance, C>

    constructor(referencePeerDescriptor: PeerDescriptor) {
        this.referenceId = new PeerDescriptorDecorator(referencePeerDescriptor).getRingId()
        this.leftNeighbors = new OrderedMap<RingDistance, C>()
        this.rightNeighbors = new OrderedMap<RingDistance, C>()
    }

    public addContact(contact: C): void {
        const id = (new PeerDescriptorDecorator(contact.getPeerDescriptor())).getRingId()
        console.log(id.toString(16))

        if (id === this.referenceId) {
            return
        }

        const leftDistance = this.getLeftDistance(id)
        const lastLeftNeighbor = this.leftNeighbors.back()

        if (lastLeftNeighbor === undefined || leftDistance < lastLeftNeighbor[0]) {
            this.leftNeighbors.setElement(leftDistance, contact)
            if (this.leftNeighbors.size() > this.numNeighborsPerSide) {
                this.leftNeighbors.eraseElementByIterator(this.leftNeighbors.rBegin())
            }
        }

        const rightDistance = this.getRightDistance(id)
        const lastRightNeighbor = this.rightNeighbors.back()

        if (lastRightNeighbor === undefined || rightDistance < lastRightNeighbor[0]) {
            this.rightNeighbors.setElement(rightDistance, contact)
            if (this.rightNeighbors.size() > this.numNeighborsPerSide) {
                this.rightNeighbors.eraseElementByIterator(this.rightNeighbors.rBegin())
            }
        }
    }

    public getAllContacts(): C[] {
        const ret: C[] = []
        this.leftNeighbors.forEach(elem => {
            ret.push(elem[1])
        })
        this.rightNeighbors.forEach(elem => {
            ret.push(elem[1])
        })

        return ret
    }

    public getClosestContacts(limitPerSide: number): C[] {
        const ret: C[] = []
        
        const leftIter = this.leftNeighbors.begin()

        
        for (let i = 0; i < limitPerSide; i++) {
            if (leftIter === this.leftNeighbors.end()) {
                break
            }
            ret.push(leftIter.pointer[1])
            leftIter.next()
        }

        const rightIter = this.rightNeighbors.begin()

        for (let i = 0; i < limitPerSide; i++) {
            if (rightIter === this.rightNeighbors.end()) {
                break
            }
            ret.push(rightIter.pointer[1])
            rightIter.next()
        }

        return ret
    }

    public getLeftNeighbors(): C[] {
        const ret: C[] = []
        this.leftNeighbors.forEach(elem => {
            ret.push(elem[1])
        })

        return ret
    }

    public getRightNeighbors(): C[] {
        const ret: C[] = []
        this.rightNeighbors.forEach(elem => {
            ret.push(elem[1])
        })

        return ret
    }

    private getLeftDistance(id: RingId): RingDistance {
       
        const diff = Math.abs(this.referenceId - id)

        if (this.referenceId > id) {
             // if id is smaller than referenceId, then the distance is the difference
            return diff as RingDistance
        } else {
            // if id is bigger than referenceId, then the distance is the ringSize - difference

            return this.ringSize - diff as RingDistance
        }
    }

    private getRightDistance(id: RingId): RingDistance {
        const diff = Math.abs(this.referenceId - id)
        
        if (this.referenceId > id) {
            // if id is smaller than referenceId, then the distance is the ringSize - difference
            return this.ringSize - diff as RingDistance
        } else {
            // if id is bigger than referenceId, then the distance is the difference
            return diff as RingDistance
        }
    }

}