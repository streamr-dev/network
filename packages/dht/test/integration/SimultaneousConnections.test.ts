import { MetricsContext, waitForCondition } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../../src/connection/ConnectorFacade'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { Message, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { createMockPeerDescriptor } from '../utils/utils'
import { getRandomRegion } from '../../src/connection/simulator/pings'
import { MockTransport } from '../utils/mock/Transport'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'

const BASE_MESSAGE: Message = {
    serviceId: 'serviceId',
    messageId: '1',
    body: {
        oneofKind: 'rpcMessage',
        rpcMessage: RpcMessage.create()
    }
}

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
    let simTransport1: SimulatorTransport
    let simTransport2: SimulatorTransport
    const peerDescriptor1 = createMockPeerDescriptor({ region: getRandomRegion() })
    const peerDescriptor2 = createMockPeerDescriptor({ region: getRandomRegion() })

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.REAL)
        simTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await simTransport1.start()
        simTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await simTransport2.start()
    })

    afterEach(async () => {
        await simTransport1.stop()
        await simTransport2.stop()
    })

    it('simultanous simulated connection', async () => {
        const msg1: Message = {
            ...BASE_MESSAGE,
            targetDescriptor: peerDescriptor2
        }
        const msg2: Message = {
            ...BASE_MESSAGE,
            targetDescriptor: peerDescriptor1
        }

        const promise1 = new Promise<void>((resolve, _reject) => {
            simTransport1.on('message', async (message: Message) => {
                expect(message.body.oneofKind).toBe('rpcMessage')
                resolve()
            })
        })
        const promise2 = new Promise<void>((resolve, _reject) => {
            simTransport2.on('message', async (message: Message) => {
                expect(message.body.oneofKind).toBe('rpcMessage')
                resolve()
            })
        })
        await Promise.all([
            promise1,
            promise2,
            simTransport1.send(msg1),
            simTransport2.send(msg2)
        ])
        await waitForCondition(() => simTransport2.hasConnection(getNodeIdFromPeerDescriptor(peerDescriptor1)))
        await waitForCondition(() => simTransport1.hasConnection(getNodeIdFromPeerDescriptor(peerDescriptor2)))
    })

    describe('Websocket 2 servers', () => {

        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager
        
        const wsPeerDescriptor1 = createMockPeerDescriptor({
            websocket: {
                host: '127.0.0.1',
                port: 43432,
                tls: false
            },
            region: getRandomRegion()
        })

        const wsPeerDescriptor2 = createMockPeerDescriptor({
            websocket: {
                host: '127.0.0.1',
                port: 43433,
                tls: false
            },
            region: getRandomRegion()
        })

        beforeEach(async () => {

            const websocketPortRange = { min: 43432, max: 43433 }
            connectionManager1 = createConnectionManager(wsPeerDescriptor1, {
                transport: new MockTransport(),
                websocketPortRange,
                entryPoints: [wsPeerDescriptor1],
                websocketServerEnableTls: false
            })
            connectionManager2 = createConnectionManager(wsPeerDescriptor2, {
                transport: new MockTransport(),
                websocketPortRange,
                entryPoints: [wsPeerDescriptor1],
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
                ...BASE_MESSAGE,
                targetDescriptor: wsPeerDescriptor2
            }
            const msg2: Message = {
                ...BASE_MESSAGE,
                targetDescriptor: wsPeerDescriptor1
            }

            const promise1 = new Promise<void>((resolve, _reject) => {
                connectionManager1.on('message', async (message: Message) => {
                    expect(message.body.oneofKind).toBe('rpcMessage')
                    resolve()
                })
            })
            const promise2 = new Promise<void>((resolve, _reject) => {
                connectionManager2.on('message', async (message: Message) => {
                    expect(message.body.oneofKind).toBe('rpcMessage')
                    resolve()
                })
            })

            await Promise.all([
                promise1,
                promise2,
                connectionManager1.send(msg1),
                connectionManager2.send(msg2)
            ])

            await waitForCondition(() => connectionManager1.hasConnection(getNodeIdFromPeerDescriptor(wsPeerDescriptor2)))
            await waitForCondition(() => connectionManager2.hasConnection(getNodeIdFromPeerDescriptor(wsPeerDescriptor1)))
        })
    })

    describe('Websocket 1 server (ConnectionRequests)', () => {
    
        let simTransport1: SimulatorTransport
        let simTransport2: SimulatorTransport
        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager

        const wsPeerDescriptor1 = createMockPeerDescriptor({
            websocket: {
                host: '127.0.0.1',
                port: 43432,
                tls: false
            },
            region: getRandomRegion()
        })

        const wsPeerDescriptor2 = createMockPeerDescriptor({ region: getRandomRegion() })

        beforeEach(async () => {
            simulator = new Simulator(LatencyType.REAL)
            simTransport1 = new SimulatorTransport(wsPeerDescriptor1, simulator)
            await simTransport1.start()
            simTransport2 = new SimulatorTransport(wsPeerDescriptor2, simulator)
            await simTransport2.start()

            connectionManager1 = createConnectionManager(wsPeerDescriptor1, {
                transport: simTransport1,
                websocketPortRange: { min: 43432, max: 43432 },
                entryPoints: [wsPeerDescriptor1],
                websocketServerEnableTls: false
            })
            connectionManager2 = createConnectionManager(wsPeerDescriptor2, {
                transport: simTransport2
            })
            await connectionManager1.start()
            await connectionManager2.start()
        })

        afterEach(async () => {
            await connectionManager1.stop()
            await connectionManager2.stop()
            await simTransport1.stop()
            await simTransport2.stop()
        })

        it('Simultaneous Connections', async () => {
            const msg1: Message = {
                ...BASE_MESSAGE,
                targetDescriptor: wsPeerDescriptor2
            }
            const msg2: Message = {
                ...BASE_MESSAGE,
                targetDescriptor: wsPeerDescriptor1
            }

            const promise1 = new Promise<void>((resolve, _reject) => {
                connectionManager1.on('message', async (message: Message) => {
                    expect(message.body.oneofKind).toBe('rpcMessage')
                    resolve()
                })
            })
            const promise2 = new Promise<void>((resolve, _reject) => {
                connectionManager2.on('message', async (message: Message) => {
                    expect(message.body.oneofKind).toBe('rpcMessage')
                    resolve()
                })
            })

            await Promise.all([
                promise1,
                promise2,
                connectionManager1.send(msg1),
                connectionManager2.send(msg2)
            ])

            await waitForCondition(() => connectionManager1.hasConnection(getNodeIdFromPeerDescriptor(wsPeerDescriptor2)))
            await waitForCondition(() => connectionManager2.hasConnection(getNodeIdFromPeerDescriptor(wsPeerDescriptor1)))
        })
    })

    describe('WebRTC', () => {

        let simTransport1: SimulatorTransport
        let simTransport2: SimulatorTransport
        let connectionManager1: ConnectionManager
        let connectionManager2: ConnectionManager

        const wrtcPeerDescriptor1 = createMockPeerDescriptor({ region: getRandomRegion() })
        const wrtcPeerDescriptor2 = createMockPeerDescriptor({ region: getRandomRegion() })

        beforeEach(async () => {
            simulator = new Simulator(LatencyType.REAL)
            simTransport1 = new SimulatorTransport(wrtcPeerDescriptor1, simulator)
            await simTransport1.start()
            simTransport2 = new SimulatorTransport(wrtcPeerDescriptor2, simulator)
            await simTransport2.start()
            connectionManager1 = createConnectionManager(wrtcPeerDescriptor1, {
                transport: simTransport1,
            })
            connectionManager2 = createConnectionManager(wrtcPeerDescriptor2, {
                transport: simTransport2,
            })
            await connectionManager1.start()
            await connectionManager2.start()
        })

        afterEach(async () => {
            await connectionManager1.stop()
            await connectionManager2.stop()
            await simTransport1.stop()
            await simTransport2.stop()
        })

        it('Simultaneous Connections', async () => {
            const msg1: Message = {
                ...BASE_MESSAGE,
                targetDescriptor: wrtcPeerDescriptor2
            }
            const msg2: Message = {
                ...BASE_MESSAGE,
                targetDescriptor: wrtcPeerDescriptor1
            }

            const promise1 = new Promise<void>((resolve, _reject) => {
                connectionManager1.on('message', async (message: Message) => {
                    expect(message.body.oneofKind).toBe('rpcMessage')
                    resolve()
                })
            })
            const promise2 = new Promise<void>((resolve, _reject) => {
                connectionManager2.on('message', async (message: Message) => {
                    expect(message.body.oneofKind).toBe('rpcMessage')
                    resolve()
                })
            })

            await Promise.all([
                promise1,
                promise2,
                connectionManager1.send(msg1),
                connectionManager2.send(msg2)
            ])

            await waitForCondition(() => connectionManager1.hasConnection(getNodeIdFromPeerDescriptor(wrtcPeerDescriptor2)))
            await waitForCondition(() => connectionManager2.hasConnection(getNodeIdFromPeerDescriptor(wrtcPeerDescriptor1)))
        })
    })

})
