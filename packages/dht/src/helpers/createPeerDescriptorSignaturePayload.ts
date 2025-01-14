import { ConnectivityMethod, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'

function convertUnsignedIntegerToBuffer(number: number): Buffer {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32BE(number)
    return buffer
}

export const createPeerDescriptorSignaturePayload = (peerDescriptor: PeerDescriptor): Uint8Array => {
    const separator = Buffer.from(',')
    const buffers = [
        peerDescriptor.type !== undefined ? convertUnsignedIntegerToBuffer(peerDescriptor.type) : new Uint8Array(0),
        separator,
        peerDescriptor.udp !== undefined ? ConnectivityMethod.toBinary(peerDescriptor.udp) : new Uint8Array(0),
        separator,
        peerDescriptor.tcp !== undefined ? ConnectivityMethod.toBinary(peerDescriptor.tcp) : new Uint8Array(0),
        separator,
        peerDescriptor.websocket !== undefined
            ? ConnectivityMethod.toBinary(peerDescriptor.websocket)
            : new Uint8Array(0),
        separator,
        peerDescriptor.region !== undefined ? convertUnsignedIntegerToBuffer(peerDescriptor.region) : new Uint8Array(0),
        separator,
        peerDescriptor.ipAddress !== undefined
            ? convertUnsignedIntegerToBuffer(peerDescriptor.ipAddress)
            : new Uint8Array(0),
        separator,
        peerDescriptor.publicKey !== undefined ? Buffer.from(peerDescriptor.publicKey) : new Uint8Array(0)
    ]
    return Buffer.concat(buffers)
}
