import { ipv4ToNumber } from '@streamr/utils'
import { createPeerDescriptor } from '../../src/helpers/createPeerDescriptor'
import { isBrowserEnvironment } from '../../src/helpers/browser/isBrowserEnvironment'
import { NodeType } from '../../generated/packages/dht/protos/DhtRpc'
import { randomDhtAddress, toDhtAddressRaw } from '../../src/identifiers'
import { getRandomRegion } from '../../dist/src/connection/simulator/pings'

const IP_ADDRESS = '1.2.3.4'

describe('createPeerDescriptor', () => {
    const region = getRandomRegion()

    it('without websocket', () => {
        const connectivityResponse = {
            ipAddress: ipv4ToNumber(IP_ADDRESS)
        } as any
        const peerDescriptor = createPeerDescriptor(connectivityResponse, region)
        expect(peerDescriptor).toEqual({
            nodeId: expect.any(Uint8Array),
            type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
            ipAddress: ipv4ToNumber(IP_ADDRESS),
            publicKey: expect.any(Uint8Array),
            signature: expect.any(Uint8Array),
            region
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
        const peerDescriptor = createPeerDescriptor(connectivityResponse, region)
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
            },
            region
        })
    })

    it('explicit nodeId', () => {
        const nodeId = randomDhtAddress()
        const connectivityResponse = {
            ipAddress: ipv4ToNumber(IP_ADDRESS)
        } as any
        const peerDescriptor = createPeerDescriptor(connectivityResponse, region, nodeId)
        expect(peerDescriptor).toEqual({
            nodeId: toDhtAddressRaw(nodeId),
            type: isBrowserEnvironment() ? NodeType.BROWSER : NodeType.NODEJS,
            ipAddress: ipv4ToNumber(IP_ADDRESS),
            publicKey: expect.any(Uint8Array),
            signature: expect.any(Uint8Array),
            region
        })
    })
})
