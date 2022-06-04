import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { waitForCondition } from 'streamr-test-utils'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'
import { NodeWebRtcConnection } from '../../src/connection/WebRTC/NodeWebRtcConnection'
import { Err } from '../../src/helpers/errors'

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

    let webrtcConnectorRpc1: RpcCommunicator
    let webrtcConnectorRpc2: RpcCommunicator

    let wsConnectorRpc1: RpcCommunicator
    let wsConnectorRpc2: RpcCommunicator

    beforeEach(async () => {

        connectorTransport1 = new MockConnectionManager(peerDescriptor1 , simulator)
        connectorTransport2 = new MockConnectionManager(peerDescriptor2, simulator)

        wsConnectorRpc1 = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "websocket",
            connectionLayer: connectorTransport1
        })
        wsConnectorRpc2 = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "websocket",
            connectionLayer: connectorTransport1
        })

        webrtcConnectorRpc1 = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "webrtc",
            connectionLayer: connectorTransport1
        })

        webrtcConnectorRpc2 = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "webrtc",
            connectionLayer: connectorTransport2
        })
        webrtcConnectorRpc1.setSendFn((_targetPeer, message) => {
            webrtcConnectorRpc2.onIncomingMessage(peerDescriptor1, message)
        })
        webrtcConnectorRpc2.setSendFn((_targetPeer, message) => {
            webrtcConnectorRpc1.onIncomingMessage(peerDescriptor2, message)
        })

        manager1 = new ConnectionManager({})
        manager2 = new ConnectionManager({})

        manager1.createWsConnector(connectorTransport1, wsConnectorRpc1)
        manager2.createWsConnector(connectorTransport2, wsConnectorRpc2)
        manager1.createWebRtcConnector(connectorTransport1, webrtcConnectorRpc1)
        manager2.createWebRtcConnector(connectorTransport2, webrtcConnectorRpc2)

        await manager1.start()
        await manager2.start()

        manager1.enableConnectivity(peerDescriptor1)
        manager2.enableConnectivity(peerDescriptor2)
    })

    afterEach(async () => {
        await manager1.stop()
        await manager2.stop()
    })

    it('Peer1 can open WebRTC Datachannels', async () => {
        const dummyMessage: Message = {
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await manager1.send(peerDescriptor2, dummyMessage)
        await waitForCondition(
            () => {
                return (!!manager1.getConnection(peerDescriptor2)
                    && manager1.getConnection(peerDescriptor2)!.connectionType === ConnectionType.WEBRTC)
            }
        )

        await waitForCondition(
            () => {
                return (!!manager2.getConnection(peerDescriptor1)
                && manager2.getConnection(peerDescriptor1)!.connectionType === ConnectionType.WEBRTC)
            }
        )
        await waitForCondition(() => (manager2.getConnection(peerDescriptor1) as NodeWebRtcConnection).isOpen())
        await waitForCondition(() => (manager1.getConnection(peerDescriptor2) as NodeWebRtcConnection).isOpen())
    })
    
    it('Peer2 can open WebRTC Datachannel', async () => {
        const dummyMessage: Message = {
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await manager2.send(peerDescriptor1, dummyMessage)
        await waitForCondition(
            () => {
                return (!!manager1.getConnection(peerDescriptor2)
                    && manager1.getConnection(peerDescriptor2)!.connectionType === ConnectionType.WEBRTC)
            }
        )
        await waitForCondition(
            () => {
                return (!!manager2.getConnection(peerDescriptor1)
                    && manager2.getConnection(peerDescriptor1)!.connectionType === ConnectionType.WEBRTC)
            }
        )
        await waitForCondition(() => (manager2.getConnection(peerDescriptor1) as NodeWebRtcConnection).isOpen())
        await waitForCondition(() => (manager1.getConnection(peerDescriptor2) as NodeWebRtcConnection).isOpen())
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await expect(manager1.send(peerDescriptor1, dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })
})