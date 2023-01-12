import { Simulator } from '../../src/connection/Simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/Simulator/SimulatorTransport'
import { PeerID } from '../../src/helpers/PeerID'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { waitForCondition } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'

describe('SimultaneousConnections', () => {

    let simulator: Simulator
    let simulatorTransport1: SimulatorTransport
    let simulatorTransport2: SimulatorTransport

    const peerDescriptor1 = {
        kademliaId: PeerID.fromString('mock1').value,
        type: 0,
        nodeName: 'mock1'
    }

    const peerDescriptor2 = {
        kademliaId: PeerID.fromString('mock2').value,
        type: 0,
        nodeName: 'mock2'
    }

    const baseMsg: Message = {
        serviceId: 'serviceId',
        messageType: MessageType.RPC,
        messageId: '1',
        body: {
            oneofKind: 'rpcMessage',
            rpcMessage: RpcMessage.create()
        }
    }

    beforeEach(async () => {
        simulator = new Simulator()
        simulatorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        simulatorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
    })

    afterEach(async () => {
        await simulatorTransport1.stop()
        await simulatorTransport2.stop()
    })

    it('simultanous simulated connection', async () => {
        const msg1: Message = {
            ...baseMsg,
            targetDescriptor: peerDescriptor2
        }
        const msg2: Message = {
            ...baseMsg,
            targetDescriptor: peerDescriptor1
        }

        const promise1 = new Promise<void>((resolve, _reject) => {
            simulatorTransport1.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        const promise2 = new Promise<void>((resolve, _reject) => {
            simulatorTransport2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        await Promise.all([
            promise1,
            promise2,
            simulatorTransport1.send(msg1),
            simulatorTransport2.send(msg2)
        ])

        // console.log(connectionManager2.getAllConnectionPeerDescriptors())
        // console.log(connectionManager1.getAllConnectionPeerDescriptors())

        await waitForCondition(() => simulatorTransport2.hasConnection(peerDescriptor1))
        await waitForCondition(() => simulatorTransport1.hasConnection(peerDescriptor2))
    })

    describe('Websocket 2 servers', () => {

        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager

        const wsPeer1: PeerDescriptor = {
            kademliaId: PeerID.fromString('mock1').value,
            nodeName: 'mock1WebSocket',
            type: NodeType.NODEJS,
            websocket: {
                ip: 'localhost',
                port: 43432
            }
        }

        const wsPeer2: PeerDescriptor = {
            kademliaId: PeerID.fromString('mock2').value,
            nodeName: 'mock2WebSocket',
            type: NodeType.NODEJS,
            websocket: {
                ip: 'localhost',
                port: 43433
            }
        }

        beforeEach(async () => {
            connectionManager1 = new ConnectionManager({
                transportLayer: simulatorTransport1,
                ownPeerDescriptor: wsPeer1,
                webSocketPort: 43432,
                entryPoints: [wsPeer1]
            })
            connectionManager2 = new ConnectionManager({
                transportLayer: simulatorTransport2,
                ownPeerDescriptor: wsPeer2,
                webSocketPort: 43433,
                entryPoints: [wsPeer1]
            })
            await connectionManager1.start(() => wsPeer1)
            await connectionManager2.start(() => wsPeer2)
        })

        afterEach(async () => {
            await connectionManager1.stop()
            await connectionManager2.stop()
        })

        it('Simultaneous Connections', async () => {
            const msg1: Message = {
                ...baseMsg,
                targetDescriptor: wsPeer2
            }
            const msg2: Message = {
                ...baseMsg,
                targetDescriptor: wsPeer1
            }

            const promise1 = new Promise<void>((resolve, _reject) => {
                connectionManager1.on('message', async (message: Message) => {
                    expect(message.messageType).toBe(MessageType.RPC)
                    resolve()
                })
            })
            const promise2 = new Promise<void>((resolve, _reject) => {
                connectionManager2.on('message', async (message: Message) => {
                    expect(message.messageType).toBe(MessageType.RPC)
                    resolve()
                })
            })

            await Promise.all([
                promise1,
                promise2,
                connectionManager1.send(msg1),
                connectionManager2.send(msg2)
            ])

            await waitForCondition(() => connectionManager1.hasConnection(wsPeer2))
            await waitForCondition(() => connectionManager2.hasConnection(wsPeer1))
        })
    })

    describe('Websocket 1 server (ConnectionRequests)', () => {

        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager

        const wsPeer1: PeerDescriptor = {
            kademliaId: PeerID.fromString('mock1').value,
            nodeName: 'mock1WebSocketServer',
            type: NodeType.NODEJS,
            websocket: {
                ip: 'localhost',
                port: 43432
            }
        }

        const wsPeer2: PeerDescriptor = {
            kademliaId: PeerID.fromString('mock2').value,
            nodeName: 'mock2WebSocketClient',
            type: NodeType.NODEJS
        }

        beforeEach(async () => {
            connectionManager1 = new ConnectionManager({
                transportLayer: simulatorTransport1,
                ownPeerDescriptor: wsPeer1,
                webSocketPort: 43432,
                entryPoints: [wsPeer1]
            })
            connectionManager2 = new ConnectionManager({
                transportLayer: simulatorTransport2,
                ownPeerDescriptor: wsPeer2
            })
            await connectionManager1.start(() => wsPeer1)
            await connectionManager2.start(() => wsPeer2)
        })

        afterEach(async () => {
            await connectionManager1.stop()
            await connectionManager2.stop()
        })

        it.only('Simultaneous Connections', async () => {
            const msg1: Message = {
                ...baseMsg,
                targetDescriptor: wsPeer2
            }
            const msg2: Message = {
                ...baseMsg,
                targetDescriptor: wsPeer1
            }

            const promise1 = new Promise<void>((resolve, _reject) => {
                connectionManager1.on('message', async (message: Message) => {
                    expect(message.messageType).toBe(MessageType.RPC)
                    resolve()
                })
            })
            const promise2 = new Promise<void>((resolve, _reject) => {
                connectionManager2.on('message', async (message: Message) => {
                    expect(message.messageType).toBe(MessageType.RPC)
                    resolve()
                })
            })

            await Promise.all([
                promise1,
                promise2,
                connectionManager1.send(msg1),
                connectionManager2.send(msg2)
            ])

            await waitForCondition(() => connectionManager1.hasConnection(wsPeer2))
            await waitForCondition(() => connectionManager2.hasConnection(wsPeer1))
        })
    })

    describe('WebRTC', () => {

        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager

        const wrtcPeer1: PeerDescriptor = {
            kademliaId: PeerID.fromString('mock1').value,
            nodeName: 'mock1WebRTC',
            type: NodeType.NODEJS
        }

        const wrtcPeer2: PeerDescriptor = {
            kademliaId: PeerID.fromString('mock2').value,
            nodeName: 'mock2WebRTC',
            type: NodeType.NODEJS
        }

        beforeEach(async () => {
            connectionManager1 = new ConnectionManager({
                transportLayer: simulatorTransport1,
                ownPeerDescriptor: wrtcPeer1,
            })
            connectionManager2 = new ConnectionManager({
                transportLayer: simulatorTransport2,
                ownPeerDescriptor: wrtcPeer1,
            })
            await connectionManager1.start(() => wrtcPeer1)
            await connectionManager2.start(() => wrtcPeer2)
        })

        afterEach(async () => {
            await connectionManager1.stop()
            await connectionManager2.stop()
        })

        it('Simultaneous Connections', async () => {
            const msg1: Message = {
                ...baseMsg,
                targetDescriptor: wrtcPeer2
            }
            const msg2: Message = {
                ...baseMsg,
                targetDescriptor: wrtcPeer1
            }

            const promise1 = new Promise<void>((resolve, _reject) => {
                connectionManager1.on('message', async (message: Message) => {
                    expect(message.messageType).toBe(MessageType.RPC)
                    resolve()
                })
            })
            const promise2 = new Promise<void>((resolve, _reject) => {
                connectionManager2.on('message', async (message: Message) => {
                    expect(message.messageType).toBe(MessageType.RPC)
                    resolve()
                })
            })

            await Promise.all([
                promise1,
                promise2,
                connectionManager1.send(msg1),
                connectionManager2.send(msg2)
            ])

            await waitForCondition(() => connectionManager1.hasConnection(wrtcPeer2))
            await waitForCondition(() => connectionManager2.hasConnection(wrtcPeer1))
        })
    })

})
