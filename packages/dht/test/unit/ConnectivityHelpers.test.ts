import { NodeType } from '../../generated/packages/dht/protos/DhtRpc'
import { expectedConnectionType } from '../../src/helpers/Connectivity'
import { ConnectionType } from '../../src/connection/IConnection'
import { createMockPeerDescriptor } from '../utils/utils'

describe('Connectivity helpers', () => {
    const tlsServerPeerDescriptor = createMockPeerDescriptor({
        websocket: {
            host: 'mock',
            port: 1234,
            tls: true
        }
    })
    const noTlsServerPeerDescriptor = createMockPeerDescriptor({
        websocket: {
            host: 'mock',
            port: 1234,
            tls: false
        }
    })
    const browserPeerDescriptor = createMockPeerDescriptor({
        type: NodeType.BROWSER
    })
    const noServerPeerDescriptor = createMockPeerDescriptor({
        type: NodeType.NODEJS
    })

    it('two server peers', () => {
        expect(expectedConnectionType(tlsServerPeerDescriptor, tlsServerPeerDescriptor)).toBe(
            ConnectionType.WEBSOCKET_CLIENT
        )
    })

    it('server to noServer', () => {
        expect(expectedConnectionType(tlsServerPeerDescriptor, noServerPeerDescriptor)).toBe(
            ConnectionType.WEBSOCKET_SERVER
        )
    })

    it('no server to server', () => {
        expect(expectedConnectionType(noServerPeerDescriptor, tlsServerPeerDescriptor)).toBe(
            ConnectionType.WEBSOCKET_CLIENT
        )
    })

    it('no server to no server', () => {
        expect(expectedConnectionType(noServerPeerDescriptor, noServerPeerDescriptor)).toBe(ConnectionType.WEBRTC)
    })

    it('browser to tls server', () => {
        expect(expectedConnectionType(browserPeerDescriptor, tlsServerPeerDescriptor)).toBe(
            ConnectionType.WEBSOCKET_CLIENT
        )
    })

    it('tls server to browser', () => {
        expect(expectedConnectionType(tlsServerPeerDescriptor, browserPeerDescriptor)).toBe(
            ConnectionType.WEBSOCKET_SERVER
        )
    })

    it('browser to no tls server', () => {
        expect(expectedConnectionType(browserPeerDescriptor, noTlsServerPeerDescriptor)).toBe(ConnectionType.WEBRTC)
    })

    it('no tls server to browser', () => {
        expect(expectedConnectionType(noTlsServerPeerDescriptor, browserPeerDescriptor)).toBe(ConnectionType.WEBRTC)
    })
})
