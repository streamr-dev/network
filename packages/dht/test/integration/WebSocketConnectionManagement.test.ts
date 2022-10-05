/* eslint-disable promise/no-nesting */

import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { waitForCondition } from 'streamr-test-utils'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'

describe('WebSocket Connection Management', () => {

    const serviceId = 'test'
    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager

    const simulator = new Simulator()

    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("peerWithServer").value,
        type: NodeType.NODEJS,
        websocket: {
            ip: 'localhost',
            port: 12223
        }
    }

    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("peerWithoutServer").value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    beforeEach(async () => {

        connectorTransport1 = new ConnectionManager({ ownPeerDescriptor: wsServerConnectorPeerDescriptor, simulator: simulator })
        connectorTransport2 = new ConnectionManager({ ownPeerDescriptor: noWsServerConnectorPeerDescriptor, simulator: simulator })

        const config1 = {
            transportLayer: connectorTransport1,
            webSocketHost: 'localhost',
            webSocketPort: 12223,
        }
        const config2 = {
            transportLayer: connectorTransport2
        }

        wsServerManager = new ConnectionManager(config1)
        noWsServerManager = new ConnectionManager(config2)

        await wsServerManager.start((_response) => wsServerConnectorPeerDescriptor)
        await noWsServerManager.start((_response) => noWsServerConnectorPeerDescriptor)
    })

    afterEach(async () => {
        await wsServerManager.stop()
        await noWsServerManager.stop()
    })

    it('Can open connections to serverless peer', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        noWsServerManager.on('data', (message: Message, _peerDescriptor: PeerDescriptor) => {
            expect(message.messageId).toEqual('mockerer')
            expect(wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_SERVER)
            expect(noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_CLIENT)

            done()
        })

        wsServerManager.send(dummyMessage, noWsServerConnectorPeerDescriptor)
    })

    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await noWsServerManager.send(dummyMessage, wsServerConnectorPeerDescriptor)
        await waitForCondition(
            () => {
                return (!!wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)
                    && wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_SERVER)
            }
        )
        await waitForCondition(
            () => noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_CLIENT
        )
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await expect(noWsServerManager.send(dummyMessage, noWsServerConnectorPeerDescriptor))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))

        await expect(wsServerManager.send(dummyMessage, wsServerConnectorPeerDescriptor))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })
})
