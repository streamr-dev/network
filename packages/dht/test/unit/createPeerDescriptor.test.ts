import { ipv4ToNumber } from '@streamr/utils'
import { createPeerDescriptor } from '../../src/helpers/createPeerDescriptor'
import { isBrowserEnvironment } from '../../src/helpers/browser/isBrowserEnvironment'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { createRandomDhtAddress, getRawFromDhtAddress } from '../../src/identifiers'

const IP_ADDRESS = '1.2.3.4'

describe('createPeerDescriptor', () => {

    it('without websocket', () => {
        const connectivityResponse = {
            ipAddress: ipv4ToNumber(IP_ADDRESS)
        } as any
        const peerDescriptor = createPeerDescriptor(connectivityResponse)
        expect(peerDescriptor).toEqual({
            nodeId: expect.any(Uint8Array),
            type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
            ipAddress: ipv4ToNumber(IP_ADDRESS),
            publicKey: expect.any(Uint8Array),
            signature: expect.any(Uint8Array)
        })
    })

    it('with websocket', () => {
        const connectivityResponse = {
            ipAddress: ipv4ToNumber(IP_ADDRESS),
            websocket: {
                host: 'bar.com',
                port: 123,
                tls: true
            }
        } as any
        const peerDescriptor = createPeerDescriptor(connectivityResponse)
        expect(peerDescriptor).toEqual({
            nodeId: expect.any(Uint8Array),
            type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
            ipAddress: ipv4ToNumber(IP_ADDRESS),
            publicKey: expect.any(Uint8Array),
            signature: expect.any(Uint8Array),
            websocket: {
                host: 'bar.com',
                port: 123,
                tls: true
            }
        })
    })

    it('explicit nodeId', () => {
        const nodeId = createRandomDhtAddress()
        const connectivityResponse = {
            ipAddress: ipv4ToNumber(IP_ADDRESS)
        } as any
        const peerDescriptor = createPeerDescriptor(connectivityResponse, nodeId)
        expect(peerDescriptor).toEqual({
            nodeId: getRawFromDhtAddress(nodeId),
            type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
            ipAddress: ipv4ToNumber(IP_ADDRESS),
            publicKey: expect.any(Uint8Array),
            signature: expect.any(Uint8Array)
        })
    })
})
