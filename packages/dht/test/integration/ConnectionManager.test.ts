import { Logger, MetricsContext, until, waitForEvent3 } from '@streamr/utils'
import { MarkOptional } from 'ts-essentials'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeOptions } from '../../src/connection/ConnectorFacade'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { createPeerDescriptor } from '../../src/helpers/createPeerDescriptor'
import { randomDhtAddress, toDhtAddressRaw } from '../../src/identifiers'
import { ConnectivityResponse, Message, NodeType, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { TransportEvents } from '../../src/transport/ITransport'
import { createMockPeerDescriptor } from '../utils/utils'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { range } from 'lodash'

const SERVICE_ID = 'demo'

const logger = new Logger(module)

// TODO: refactor this test file to use beforeEach and AfterEach for proper teardown
describe('ConnectionManager', () => {
    const mockPeerDescriptor1 = createMockPeerDescriptor()
    const mockPeerDescriptor2 = createMockPeerDescriptor()
    const mockPeerDescriptor3 = createMockPeerDescriptor()
    const mockPeerDescriptor4 = createMockPeerDescriptor()
    const simulator = new Simulator()
    const mockTransport = new SimulatorTransport(mockPeerDescriptor1, simulator)
    const mockConnectorTransport1 = new SimulatorTransport(mockPeerDescriptor1, simulator)
    const mockConnectorTransport2 = new SimulatorTransport(mockPeerDescriptor2, simulator)
    let createLocalPeerDescriptor: jest.Mock<PeerDescriptor, [ConnectivityResponse]>

    const createConnectionManager = (
        opts: MarkOptional<DefaultConnectorFacadeOptions, 'createLocalPeerDescriptor'>
    ) => {
        return new ConnectionManager({
            createConnectorFacade: () =>
                new DefaultConnectorFacade({
                    createLocalPeerDescriptor: async (response) => createLocalPeerDescriptor(response),
                    websocketServerEnableTls: false,
                    ...opts
                }),
            metricsContext: new MetricsContext(),
            allowIncomingPrivateConnections: true
        })
    }

    beforeEach(() => {
        createLocalPeerDescriptor = jest
            .fn()
            .mockImplementation((response) => createPeerDescriptor(response, getRandomRegion()))
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
        const entryPoint = createMockPeerDescriptor({
            websocket: { host: '127.0.0.1', port: 12345, tls: false }
        })
        const connectionManager = createConnectionManager({
            transport: mockTransport,
            websocketPortRange: { min: 9992, max: 9992 },
            entryPoints: [entryPoint]
        })

        await expect(connectionManager.start()).rejects.toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    }, 15000)

    it('Succesfully connectivityChecks if at least one entry point is online', async () => {
        // Create offline PeerDescriptors
        const entryPoints = range(4).map((i) => {
            return createMockPeerDescriptor({
                websocket: { host: '127.0.0.1', port: 12345 + i, tls: false }
            })
        })
        entryPoints.push(
            createMockPeerDescriptor({
                websocket: { host: '127.0.0.1', port: 9998, tls: false }
            })
        )
        const connectionManager = createConnectionManager({
            transport: mockTransport,
            websocketPortRange: { min: 9998, max: 9998 },
            entryPoints
        })
        await connectionManager.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        await connectionManager.stop()
    }, 20000)

    it('Can probe connectivity in open internet', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9993, max: 9993 }
        })

        await connectionManager1.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        const entryPoint = createMockPeerDescriptor({
            websocket: { host: '127.0.0.1', port: 9993, tls: false }
        })
        const connectionManager2 = createConnectionManager({
            transport: mockConnectorTransport2,
            websocketPortRange: { min: 9994, max: 9994 },
            entryPoints: [entryPoint]
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
            entryPoints: [connectionManager1.getLocalPeerDescriptor()]
        })

        await connectionManager2.start()
        expect(createLocalPeerDescriptor.mock.calls[1][0].host).toEqual('127.0.0.1')

        const msg: Message = {
            serviceId: SERVICE_ID,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.body.oneofKind).toBe('rpcMessage')
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
            websocketPortRange: { min: 9997, max: 9997 }
        })

        await connectionManager1.start()
        expect(createLocalPeerDescriptor.mock.calls[0][0].host).toEqual('127.0.0.1')

        const connectionManager2 = createConnectionManager({
            transport: mockConnectorTransport2,
            websocketPortRange: { min: 9999, max: 9999 },
            websocketServerEnableTls: false,
            entryPoints: [connectionManager1.getLocalPeerDescriptor()]
        })

        await connectionManager2.start()

        const msg: Message = {
            serviceId: SERVICE_ID,
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
                expect(message.body.oneofKind).toBe('rpcMessage')
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
            serviceId: SERVICE_ID,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }

        const dataPromise = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('message', async (message: Message) => {
                expect(message.body.oneofKind).toBe('rpcMessage')
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
        simulator2.stop()
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
            serviceId: SERVICE_ID,
            messageId: '1',
            targetDescriptor: peerDescriptor,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }
        await expect(connectionManager1.send(msg)).rejects.toThrow('Cannot send to self')

        await connectionManager1.stop()
    })

    it('Cannot send to a WebSocketServer if nodeIds do not match', async () => {
        const peerDescriptor1 = createMockPeerDescriptor({
            websocket: {
                host: '127.0.0.1',
                port: 10002,
                tls: false
            }
        })
        const peerDescriptor2 = createMockPeerDescriptor({
            websocket: {
                host: '127.0.0.1',
                port: 10003,
                tls: false
            }
        })
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10002, max: 10002 },
            createLocalPeerDescriptor: async () => peerDescriptor1
        })

        await connectionManager1.start()

        const connectionManager2 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10003, max: 10003 },
            createLocalPeerDescriptor: async () => peerDescriptor2
        })

        await connectionManager2.start()

        const msg: Message = {
            serviceId: SERVICE_ID,
            messageId: '1',
            targetDescriptor: {
                // This is not the correct nodeId of peerDescriptor2
                nodeId: toDhtAddressRaw(randomDhtAddress()),
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
            expect(connectionManager1.send(msg)).rejects.toThrow()
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

    it('Stopping ConnectionManager is cleaned up from peers', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketServerEnableTls: false,
            websocketPortRange: { min: 10005, max: 10005 }
        })

        await connectionManager1.start()

        const connectionManager2 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketServerEnableTls: false,
            websocketPortRange: { min: 10006, max: 10006 }
        })

        await connectionManager2.start()

        const msg: Message = {
            serviceId: SERVICE_ID,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            targetDescriptor: connectionManager1.getLocalPeerDescriptor()
        }

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
        await Promise.all([connectedPromise1, connectedPromise2, connectionManager2.send(msg)])

        expect(connectionManager1.getConnections().length).toEqual(1)
        expect(connectionManager2.getConnections().length).toEqual(1)

        await connectionManager1.stop()

        expect(connectionManager2.getConnections().length).toEqual(0)

        await connectionManager2.stop()
    })

    it('private connections', async () => {
        const connectionManager1 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketServerEnableTls: false,
            websocketPortRange: { min: 10009, max: 10009 }
        })

        await connectionManager1.start()

        const connectionManager2 = createConnectionManager({
            transport: mockTransport,
            websocketHost: '127.0.0.1',
            websocketServerEnableTls: false,
            websocketPortRange: { min: 10010, max: 100010 }
        })

        await connectionManager2.start()

        const msg: Message = {
            serviceId: SERVICE_ID,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            targetDescriptor: connectionManager1.getLocalPeerDescriptor()
        }

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
        await Promise.all([connectedPromise1, connectedPromise2, connectionManager2.send(msg)])

        await connectionManager1.enablePrivateClientMode()
        await until(() => connectionManager2.getConnections().length === 0)
        expect(connectionManager1.getConnections().length).toEqual(1)

        await connectionManager1.disablePrivateClientMode()
        await until(() => connectionManager2.getConnections().length === 1)
        expect(connectionManager1.getConnections().length).toEqual(1)

        await connectionManager1.stop()
        await connectionManager2.stop()
    })
})
