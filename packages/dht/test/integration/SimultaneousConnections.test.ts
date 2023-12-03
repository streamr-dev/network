import { MetricsContext, waitForCondition } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../../src/connection/ConnectorFacade'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { PeerID } from '../../src/helpers/PeerID'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

const createConnectionManager = (localPeerDescriptor: PeerDescriptor, opts: Omit<DefaultConnectorFacadeConfig, 'createLocalPeerDescriptor'>) => {
    return new ConnectionManager({
        createConnectorFacade: () => new DefaultConnectorFacade({
            createLocalPeerDescriptor: () => localPeerDescriptor,
            ...opts
        }),
        metricsContext: new MetricsContext()
    })
}

describe('SimultaneousConnections', () => {

    let simulator: Simulator
    let simulatorTransport1: SimulatorTransport
    let simulatorTransport2: SimulatorTransport

    const peerDescriptor1 = {
        nodeId: PeerID.fromString('mock1').value,
        type: NodeType.NODEJS
    }

    const peerDescriptor2 = {
        nodeId: PeerID.fromString('mock2').value,
        type: NodeType.NODEJS
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
        await simulatorTransport1.start()
        simulatorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await simulatorTransport2.start()
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
        await waitForCondition(() => simulatorTransport2.hasConnection(peerDescriptor1))
        await waitForCondition(() => simulatorTransport1.hasConnection(peerDescriptor2))
    })

    describe('Websocket 2 servers', () => {

        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager

        const wsPeer1: PeerDescriptor = {
            nodeId: PeerID.fromString('mock1').value,
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 43432,
                tls: false
            }
        }

        const wsPeer2: PeerDescriptor = {
            nodeId: PeerID.fromString('mock2').value,
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 43433,
                tls: false
            }
        }

        beforeEach(async () => {
            const websocketPortRange = { min: 43432, max: 43433 }
            connectionManager1 = createConnectionManager(wsPeer1, {
                transport: simulatorTransport1,
                websocketPortRange,
                entryPoints: [wsPeer1],
                websocketServerEnableTls: false
            })
            connectionManager2 = createConnectionManager(wsPeer2, {
                transport: simulatorTransport2,
                websocketPortRange,
                entryPoints: [wsPeer1],
                websocketServerEnableTls: false
            })
            await connectionManager1.start()
            await connectionManager2.start()
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
            nodeId: PeerID.fromString('mock1').value,
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 43432,
                tls: false
            }
        }

        const wsPeer2: PeerDescriptor = {
            nodeId: PeerID.fromString('mock2').value,
            type: NodeType.NODEJS
        }

        beforeEach(async () => {
            connectionManager1 = createConnectionManager(wsPeer1, {
                transport: simulatorTransport1,
                websocketPortRange: { min: 43432, max: 43432 },
                entryPoints: [wsPeer1],
                websocketServerEnableTls: false
            })
            connectionManager2 = createConnectionManager(wsPeer2, {
                transport: simulatorTransport2
            })
            await connectionManager1.start()
            await connectionManager2.start()
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
            nodeId: PeerID.fromString('mock1').value,
            type: NodeType.NODEJS
        }

        const wrtcPeer2: PeerDescriptor = {
            nodeId: PeerID.fromString('mock2').value,
            type: NodeType.NODEJS
        }

        beforeEach(async () => {
            connectionManager1 = createConnectionManager(wrtcPeer1, {
                transport: simulatorTransport1,
            })
            connectionManager2 = createConnectionManager(wrtcPeer2, {
                transport: simulatorTransport2,
            })
            await connectionManager1.start()
            await connectionManager2.start()
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
