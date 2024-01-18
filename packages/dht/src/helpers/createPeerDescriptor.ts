import {
    createSignature,
    hash
} from '@streamr/utils'
import crypto from 'crypto'
import { isBrowserEnvironment } from '../helpers/browser/isBrowserEnvironment'
import { createPeerDescriptorSignaturePayload } from '../helpers/createPeerDescriptorSignaturePayload'
import { DhtAddress, DhtAddressRaw, getRawFromDhtAddress } from '../identifiers'
import {
    ConnectivityResponse,
    NodeType,
    PeerDescriptor
} from '../proto/packages/dht/protos/DhtRpc'

const calculateNodeIdRaw = (ipAddress: number, privateKey: Uint8Array): DhtAddressRaw => {
    // nodeId is calculated as 
    // concatenate(
    //   get104leastSignificatBits(hash(ipAddress)), 
    //   get56leastSignificatBits(sign(ipAddress))
    // )
    const ipAsBuffer = Buffer.alloc(4)
    ipAsBuffer.writeUInt32BE(ipAddress)
    const ipHash = hash(ipAsBuffer)
    const signature = createSignature(ipAsBuffer, privateKey)
    const nodeIdRaw = Buffer.concat([
        ipHash.slice(ipHash.length - 13, ipHash.length),
        signature.slice(signature.length - 7, signature.length)
    ])
    return nodeIdRaw
}

export const createPeerDescriptor = (msg: ConnectivityResponse, nodeId?: DhtAddress): PeerDescriptor => {
    const privateKey = crypto.randomBytes(32)
    const publicKey = crypto.randomBytes(20)  // TODO calculate publicKey from privateKey
    let nodeIdRaw: DhtAddressRaw
    // ToDo: add checking that the nodeId is valid
    if (nodeId !== undefined) {
        nodeIdRaw = getRawFromDhtAddress(nodeId)
    } else {
        nodeIdRaw = calculateNodeIdRaw(msg.ipAddress, privateKey)
    }
    const ret: PeerDescriptor = {
        nodeId: nodeIdRaw,
        type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
        ipAddress: msg.ipAddress,
        publicKey 
    }
    if (msg.websocket) {
        ret.websocket = {
            host: msg.websocket.host,
            port: msg.websocket.port,
            tls: msg.websocket.tls
        }
    }
    ret.signature = createSignature(createPeerDescriptorSignaturePayload(ret), privateKey)
    return ret
}
