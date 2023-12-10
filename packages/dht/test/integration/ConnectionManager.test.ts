import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { ConnectivityResponse, Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { createPeerDescriptor } from '../../src/dht/DhtNode'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { Logger, MetricsContext, waitForEvent3 } from '@streamr/utils'
import { SimulatorTransport } from '../../src/exports'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../../src/connection/ConnectorFacade'
import { MarkOptional } from 'ts-essentials'
import { createRandomNodeId } from '../../src/helpers/nodeId'
import { TransportEvents } from '../../src/transport/ITransport'

const logger = new Logger(module)

// TODO: refactor this test file to use beforeEach and AfterEach for proper teardown
describe('ConnectionManager', () => {
    const serviceId = 'demo'

    const mockPeerDescriptor1: PeerDescriptor = {
        nodeId: PeerID.fromString('tester1').value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        nodeId: PeerID.fromString('tester2').value,
        type: NodeType.NODEJS
    }

    const mockPeerDescriptor3: PeerDescriptor = {
        nodeId: PeerID.fromString('tester3').value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor4: PeerDescriptor = {
        nodeId: PeerID.fromString('tester4').value,
        type: NodeType.NODEJS
    }
    const simulator = new Simulator()

    const mockTransport = new SimulatorTransport(mockPeerDescriptor1, simulator)
    const mockConnectorTransport1 = new SimulatorTransport(mockPeerDescriptor1, simulator)
    const mockConnectorTransport2 = new SimulatorTransport(mockPeerDescriptor2, simulator)

    let createLocalPeerDescriptor: jest.Mock<PeerDescriptor, [ConnectivityResponse]>

    const createConnectionManager = (opts: MarkOptional<DefaultConnectorFacadeConfig, 'createLocalPeerDescriptor'>) => {
        return new ConnectionManager({
            createConnectorFacade: () => new DefaultConnectorFacade({
                createLocalPeerDescriptor,
                websocketServerEnableTls: false,
                ...opts
            }),
            metricsContext: new MetricsContext()
        })
    }

    beforeEach(() => {
        createLocalPeerDescriptor = jest.fn().mockImplementation((response) => createPeerDescriptor(response))
    })

    beforeAll(async () => {
        await mockTransport.start()
        await mockConnectorTransport1.start()
        await mockConnectorTransport2.start()
    })

    afterAll(async () => {
        await mockTransport.stop()
        await mockConnectorTransport1.stop()
        await mockConnectorTransport2.stop()
    })

    it('Can start alone', async () => {

        const connectionManager = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9991, max: 9991 }
        })

        await connectionManager.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        await connectionManager.stop()
    })

    it('Throws an async exception if fails to connect to entrypoints', async () => {

        const connectionManager = createConnectionManager({
            transport: mockTransport,
            websocketPortRange: { min: 9992, max: 9992 },
            entryPoints: [
                { nodeId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { host: '127.0.0.1', port: 12345, tls: false } }
            ]
        })

        await expect(connectionManager.start()).rejects.toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    }, 15000)

    it('Can probe connectivity in open internet', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9993, max: 9993 }
        })

        await connectionManager1.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        const connectionManager2 = createConnectionManager({
            transport: mockConnectorTransport2,
            websocketPortRange: { min: 9994, max: 9994 },
            entryPoints: [
                { nodeId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { host: '127.0.0.1', port: 9993, tls: false } }
            ]
        })

        await connectionManager2.start()
        expect(createLocalPeerDescriptor.mock.calls[1][0].host).toEqual('127.0.0.1')

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Can send data to other connectionmanager over websocket', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockConnectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9995, max: 9995 }
        })

        await connectionManager1.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        const connectionManager2 = createConnectionManager({
            transport: mockConnectorTransport2,
            websocketPortRange: { min: 9996, max: 9996 },
            entryPoints: [
                connectionManager1.getLocalPeerDescriptor()
            ]
        })

        await connectionManager2.start()
        expect(createLocalPeerDescriptor.mock.calls[1][0].host).toEqual('127.0.0.1')

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager1.on('connected', () => {
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('connected', () => {
                resolve()
            })
        })

        msg.targetDescriptor = connectionManager2.getLocalPeerDescriptor()
        connectionManager1.send(msg)

        await Promise.all([promise, connectedPromise1, connectedPromise2])

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Can disconnect websockets', async () => {
        const connectionManager1 = createConnectionManager({ 
            transport: mockConnectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9997, max: 9997 },
        })

        await connectionManager1.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        const connectionManager2 = createConnectionManager({
            transport: mockConnectorTransport2,
            websocketPortRange: { min: 9999, max: 9999 },
            websocketServerEnableTls: false,
            entryPoints: [
                connectionManager1.getLocalPeerDescriptor()
            ]
        })

        await connectionManager2.start()

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager1.on('disconnected', () => {
                logger.info('disconnectedPromise1')
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('disconnected', () => {
                logger.info('disconnectedPromise2')
                resolve()
            })
        })

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        msg.targetDescriptor = connectionManager2.getLocalPeerDescriptor()
        connectionManager1.send(msg)

        await promise

        // @ts-expect-error private field
        connectionManager1.closeConnection(connectionManager2.getLocalPeerDescriptor())

        await Promise.all([disconnectedPromise1, disconnectedPromise2])

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Connects and disconnects over simulated connections', async () => {
        const simulator2 = new Simulator()
        const connectionManager3 = new SimulatorTransport(mockPeerDescriptor3, simulator2)
        await connectionManager3.start()
        const connectionManager4 = new SimulatorTransport(mockPeerDescriptor4, simulator2)
        await connectionManager4.start()

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }

        const dataPromise = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('connected', () => {
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager3.on('connected', () => {
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('disconnected', () => {
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager3.on('disconnected', () => {
                resolve()
            })
        })
        msg.targetDescriptor = mockPeerDescriptor4
        connectionManager3.send(msg)
        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])

        // @ts-expect-error private field
        connectionManager3.closeConnection(mockPeerDescriptor4)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])
        await connectionManager3.stop()
        await connectionManager4.stop()
    })

    it('Cannot send to own WebsocketServer if nodeIds do not match', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10001, max: 10001 }
        })

        await connectionManager1.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')
        
        const peerDescriptor = connectionManager1.getLocalPeerDescriptor()
        peerDescriptor.nodeId = new Uint8Array([12, 12, 12, 12])
        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            targetDescriptor: peerDescriptor,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }
        await expect(connectionManager1.send(msg))
            .rejects
            .toThrow('Cannot send to self')
        
        await connectionManager1.stop()
    })

    it('Cannot send to a WebSocketServer if nodeIds do not match', async () => {

        const peerDescriptor1 = {
            nodeId: createRandomNodeId(),
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 10002,
                tls: false
            }
        }

        const peerDescriptor2 = {
            nodeId: createRandomNodeId(),
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 10003,
                tls: false
            }
        }
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10002, max: 10002 },
            createLocalPeerDescriptor: () => peerDescriptor1 
        })

        await connectionManager1.start()

        const connectionManager2 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10003, max: 10003 },
            createLocalPeerDescriptor: () => peerDescriptor2
        })

        await connectionManager2.start()

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            targetDescriptor: {
                // This is not the correct nodeId of peerDescriptor2
                nodeId: new Uint8Array([1, 2, 3, 4]),
                type: NodeType.NODEJS,
                websocket: peerDescriptor2.websocket
            },
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }
        await Promise.all([
            waitForEvent3<TransportEvents>(connectionManager1, 'disconnected'),
            expect(connectionManager1.send(msg))      
                .rejects
                .toThrow()
        ])
        
        await connectionManager1.stop()
        await connectionManager2.stop()
    }, 10000)

    it('Failed autocertification', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            autoCertifierUrl: 'https://127.0.0.1:12333',
            websocketServerEnableTls: true,
            websocketPortRange: { min: 10004, max: 10004 }
        })

        await connectionManager1.start()
        expect(connectionManager1.getLocalPeerDescriptor().websocket!.tls).toEqual(false)
        await connectionManager1.stop()
    })
})
