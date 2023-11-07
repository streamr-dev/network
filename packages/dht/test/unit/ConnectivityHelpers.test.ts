import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { expectedConnectionType } from '../../src/helpers/Connectivity'
import { ConnectionType } from '../../src/connection/IConnection'

describe('Connectivity helpers', () => {

    const tlsServerPeerDescriptor = {
        kademliaId: new Uint8Array(1),
        type: NodeType.NODEJS,
        websocket: {
            host: 'mock',
            port: 1234,
            tls: true
        }
    }

    const noTlsServerPeerDescriptor = {
        kademliaId: new Uint8Array(1),
        type: NodeType.NODEJS,
        websocket: {
            host: 'mock',
            port: 1234,
            tls: false
        }
    }

    const browserPeerDescriptor = {
        kademliaId: new Uint8Array(2),
        type: NodeType.BROWSER
    }

    const noServerPeerDescriptor = {
        kademliaId: new Uint8Array(3),
        type: NodeType.NODEJS
    }

    it('two server peers', () => {
        expect(expectedConnectionType(tlsServerPeerDescriptor, tlsServerPeerDescriptor)).toBe(ConnectionType.WEBSOCKET_CLIENT)
    })

    it('server to noServer', () => {
        expect(expectedConnectionType(tlsServerPeerDescriptor, noServerPeerDescriptor)).toBe(ConnectionType.WEBSOCKET_SERVER)
    })

    it('no server to server', () => {
        expect(expectedConnectionType(noServerPeerDescriptor, tlsServerPeerDescriptor)).toBe(ConnectionType.WEBSOCKET_CLIENT)
    })

    it('no server to no server', () => {
        expect(expectedConnectionType(noServerPeerDescriptor, noServerPeerDescriptor)).toBe(ConnectionType.WEBRTC)
    })

    it('browser to tls server', () => {
        expect(expectedConnectionType(browserPeerDescriptor, tlsServerPeerDescriptor)).toBe(ConnectionType.WEBSOCKET_CLIENT)
    })

    it('browser to no tls server', () => {
        expect(expectedConnectionType(browserPeerDescriptor, noTlsServerPeerDescriptor)).toBe(ConnectionType.WEBRTC)
    })

    it('tls server to browser', () => {
        expect(expectedConnectionType(tlsServerPeerDescriptor, browserPeerDescriptor)).toBe(ConnectionType.WEBSOCKET_SERVER)
    })

})
