/* eslint-disable promise/no-nesting */

import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'
import { waitForCondition } from '@streamr/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

describe('WebSocket Connection Management', () => {

    const serviceId = 'test'
    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager

    const simulator = new Simulator()

    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString("peerWithServer").value,
        type: NodeType.NODEJS,
        websocket: {
            ip: '127.0.0.1',
            port: 12223
        }
    }

    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString("peerWithoutServer").value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    beforeEach(async () => {

        connectorTransport1 = new ConnectionManager({ ownPeerDescriptor: wsServerConnectorPeerDescriptor, simulator: simulator })
        connectorTransport2 = new ConnectionManager({ ownPeerDescriptor: noWsServerConnectorPeerDescriptor, simulator: simulator })

        const config1 = {
            transportLayer: connectorTransport1,
            webSocketHost: '127.0.0.1',
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
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: noWsServerConnectorPeerDescriptor
        }
        noWsServerManager.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            expect(wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_SERVER)
            expect(noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_CLIENT)

            done()
        })

        wsServerManager.send(dummyMessage)
    })

    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: wsServerConnectorPeerDescriptor
        }
        await noWsServerManager.send(dummyMessage)
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
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: noWsServerConnectorPeerDescriptor
        }
        await expect(noWsServerManager.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))

        dummyMessage.targetDescriptor = wsServerConnectorPeerDescriptor
        await expect(wsServerManager.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })
})
