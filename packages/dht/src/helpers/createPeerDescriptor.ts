import { ECDSA_SECP256K1_EVM } from '@streamr/utils'
import crypto from 'crypto'
import { isBrowserEnvironment } from '../helpers/browser/isBrowserEnvironment'
import { createPeerDescriptorSignaturePayload } from '../helpers/createPeerDescriptorSignaturePayload'
import { DhtAddress, DhtAddressRaw, toDhtAddressRaw } from '../identifiers'
import {
    ConnectivityResponse,
    NodeType,
    PeerDescriptor
} from '../../generated/packages/dht/protos/DhtRpc'

const calculateNodeIdRaw = async (ipAddress: number, privateKey: Uint8Array): Promise<DhtAddressRaw> => {
    // nodeId is calculated as 
    // concatenate(
    //   get104leastSignificatBits(hash(ipAddress)), 
    //   get56leastSignificatBits(sign(ipAddress))
    // )
    const ipAsBuffer = Buffer.alloc(4)
    ipAsBuffer.writeUInt32BE(ipAddress)
    const ipHash = ECDSA_SECP256K1_EVM.keccakHash(ipAsBuffer)
    const signature = await ECDSA_SECP256K1_EVM.createSignature(ipAsBuffer, privateKey)
    const nodeIdRaw = Buffer.concat([
        ipHash.subarray(ipHash.length - 13, ipHash.length),
        signature.subarray(signature.length - 7, signature.length)
    ])
    return nodeIdRaw
}

export const createPeerDescriptor = async (connectivityResponse: ConnectivityResponse, 
    region: number, nodeId?: DhtAddress): Promise<PeerDescriptor> => {
    const privateKey = crypto.randomBytes(32)
    const publicKey = crypto.randomBytes(20)  // TODO calculate publicKey from privateKey
    let nodeIdRaw: DhtAddressRaw
    if (nodeId !== undefined) {
        nodeIdRaw = toDhtAddressRaw(nodeId)
    } else {
        nodeIdRaw = await calculateNodeIdRaw(connectivityResponse.ipAddress, privateKey)
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
    ret.signature = await ECDSA_SECP256K1_EVM.createSignature(createPeerDescriptorSignaturePayload(ret), privateKey)
    return ret
}
