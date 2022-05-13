import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/PeerID'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'

describe('WebSocket IConnection Requests', () => {
    let serverManager: ConnectionManager
    let noServerManager: ConnectionManager
    let epManager: ConnectionManager

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("entryPoint").value,
        websocket: {
            port: 12212,
            ip: 'localhost'
        },
        type: NodeType.NODEJS
    }
    const serverPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("serverManager").value,
        websocket: {
            port: 12213,
            ip: 'localhost'
        },
        type: NodeType.NODEJS
    }
    const noServerPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("noServerManager").value,
        type: NodeType.NODEJS
    }
    beforeEach(async () => {
        epManager = new ConnectionManager({webSocketPort: epPeerDescriptor.websocket!.port, })
        serverManager = new ConnectionManager({webSocketPort: serverPeerDescriptor.websocket!.port, entryPoints: [epPeerDescriptor]})
        noServerManager = new ConnectionManager({entryPoints: [epPeerDescriptor]})

        await epManager.start(new MockConnectionManager(epPeerDescriptor))
        await serverManager.start(new MockConnectionManager(serverPeerDescriptor))
        await noServerManager.start(new MockConnectionManager(noServerPeerDescriptor))
    })
    afterEach(() => {

    })

    it('happy path', () => {

    })
})