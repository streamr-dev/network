import { EVM_SECP256K1 } from '@streamr/utils'
import crypto from 'crypto'
import { isBrowserEnvironment } from '../helpers/browser/isBrowserEnvironment'
import { createPeerDescriptorSignaturePayload } from '../helpers/createPeerDescriptorSignaturePayload'
import { DhtAddress, DhtAddressRaw, toDhtAddressRaw } from '../identifiers'
import {
    ConnectivityResponse,
    NodeType,
    PeerDescriptor
} from '../../generated/packages/dht/protos/DhtRpc'

const calculateNodeIdRaw = (ipAddress: number, privateKey: Uint8Array): DhtAddressRaw => {
    // nodeId is calculated as 
    // concatenate(
    //   get104leastSignificatBits(hash(ipAddress)), 
    //   get56leastSignificatBits(sign(ipAddress))
    // )
    const ipAsBuffer = Buffer.alloc(4)
    ipAsBuffer.writeUInt32BE(ipAddress)
    const ipHash = EVM_SECP256K1.keccakHash(ipAsBuffer)
    const signature = EVM_SECP256K1.createSignature(ipAsBuffer, privateKey)
    const nodeIdRaw = Buffer.concat([
        ipHash.subarray(ipHash.length - 13, ipHash.length),
        signature.subarray(signature.length - 7, signature.length)
    ])
    return nodeIdRaw
}

export const createPeerDescriptor = (connectivityResponse: ConnectivityResponse, region: number, nodeId?: DhtAddress): PeerDescriptor => {
    const privateKey = crypto.randomBytes(32)
    const publicKey = crypto.randomBytes(20)  // TODO calculate publicKey from privateKey
    let nodeIdRaw: DhtAddressRaw
    if (nodeId !== undefined) {
        nodeIdRaw = toDhtAddressRaw(nodeId)
    } else {
        nodeIdRaw = calculateNodeIdRaw(connectivityResponse.ipAddress, privateKey)
    }
    const ret: PeerDescriptor = {
        nodeId: nodeIdRaw,
        type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
        ipAddress: connectivityResponse.ipAddress,
        region,
        publicKey 
    }
    if (connectivityResponse.websocket) {
        ret.websocket = {
            host: connectivityResponse.websocket.host,
            port: connectivityResponse.websocket.port,
            tls: connectivityResponse.websocket.tls
        }
    }
    ret.signature = EVM_SECP256K1.createSignature(createPeerDescriptorSignaturePayload(ret), privateKey)
    return ret
}
