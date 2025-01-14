import { PeerDescriptor } from '../../../generated/packages/dht/protos/DhtRpc'

// Notice: you cannot convert RingId to RingIdRaw, because
// RingId is only an approximation of the actual value.
// That is why RingIdRaw is widely used in the codebase.

export type RingIdRaw = Uint8Array & { __ringIdRaw: never }
export type RingId = number & { __ringId: never }
export type RingDistance = number & { __ringDistance: never }

export const RING_SIZE = 2 ** 120 - 1 // 2^120 - 1

const binaryToBigInt = (binary: Uint8Array): bigint => {
    return binary.reduce((acc, val) => (acc << BigInt(8)) | BigInt(val), BigInt(0))
}

export const getRingIdFromRaw = (raw: RingIdRaw): RingId => Number(binaryToBigInt(raw)) as RingId

export const getRingIdRawFromPeerDescriptor = (peerDescriptor: PeerDescriptor): RingIdRaw => {
    const regionAsBuffer = Buffer.alloc(4)
    regionAsBuffer.writeUInt32BE(peerDescriptor.region ?? 0, 0)
    const ipAsbuffer = Buffer.alloc(4)
    ipAsbuffer.writeUInt32BE(peerDescriptor.ipAddress ?? 0, 0)

    const uniquePartAsBuffer = Buffer.from(
        peerDescriptor.nodeId.subarray(peerDescriptor.nodeId.length - 7, peerDescriptor.nodeId.length)
    )

    const arr = [regionAsBuffer, ipAsbuffer, uniquePartAsBuffer]

    const buffer = Buffer.concat(arr)
    return new Uint8Array(buffer) as RingIdRaw
}

export const getRingIdFromPeerDescriptor = (peerDescriptor: PeerDescriptor): RingId => {
    const raw = getRingIdRawFromPeerDescriptor(peerDescriptor)
    return Number(binaryToBigInt(raw)) as RingId
}

export const getLeftDistance = (referenceId: RingId, id: RingId): RingDistance => {
    const diff = Math.abs(referenceId - id)
    if (referenceId > id) {
        // if id is smaller than referenceId, then the distance is the difference
        return diff as RingDistance
    } else {
        // if id is bigger than referenceId, then the distance is the ringSize - difference
        return (RING_SIZE - diff) as RingDistance
    }
}

export const getRightDistance = (referenceId: RingId, id: RingId): RingDistance => {
    const diff = Math.abs(referenceId - id)
    if (referenceId > id) {
        // if id is smaller than referenceId, then the distance is the ringSize - difference
        return (RING_SIZE - diff) as RingDistance
    } else {
        // if id is bigger than referenceId, then the distance is the difference
        return diff as RingDistance
    }
}
