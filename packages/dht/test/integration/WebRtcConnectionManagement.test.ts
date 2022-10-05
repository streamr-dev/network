import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'

describe('WebRTC Connection Management', () => {

    let manager1: ConnectionManager
    let manager2: ConnectionManager

    const simulator = new Simulator()

    const peerDescriptor1: PeerDescriptor = {
        peerId: PeerID.fromString("peer1").value,
        type: NodeType.NODEJS,
    }

    const peerDescriptor2: PeerDescriptor = {
        peerId: PeerID.fromString("peer2").value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    beforeEach(async () => {

        connectorTransport1 = new ConnectionManager({ ownPeerDescriptor: peerDescriptor1, simulator })
        manager1 = new ConnectionManager({ transportLayer: connectorTransport1 })

        connectorTransport2 = new ConnectionManager({ ownPeerDescriptor: peerDescriptor2, simulator })
        manager2 = new ConnectionManager({ transportLayer: connectorTransport2 })

        await manager1.start((_msg) => peerDescriptor1)
        await manager2.start((_msg) => peerDescriptor2)

    })

    afterEach(async () => {
        await manager1.stop()
        await manager2.stop()
    })

    const serviceId = 'dummy'

    it('Peer1 can open WebRTC Datachannels', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }

        manager2.on('data', (message: Message, _peerDescriptor: PeerDescriptor) => {
            expect(message.messageId).toEqual('mockerer')
            expect(manager1.getConnection(peerDescriptor2)!.connectionType).toEqual(ConnectionType.WEBRTC)
            expect(manager2.getConnection(peerDescriptor1)!.connectionType).toEqual(ConnectionType.WEBRTC)

            done()
        })
        manager1.send(dummyMessage, peerDescriptor2)
    })

    it('Peer2 can open WebRTC Datachannel', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        manager1.on('data', (message: Message, _peerDescriptor: PeerDescriptor) => {
            expect(message.messageId).toEqual('mockerer')
            expect(manager1.getConnection(peerDescriptor2)!.connectionType).toEqual(ConnectionType.WEBRTC)
            expect(manager2.getConnection(peerDescriptor1)!.connectionType).toEqual(ConnectionType.WEBRTC)

            done()
        })
        manager2.send(dummyMessage, peerDescriptor1)
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await expect(manager1.send(dummyMessage, peerDescriptor1))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })
})
