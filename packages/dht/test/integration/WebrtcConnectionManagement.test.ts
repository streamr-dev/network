import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { ConnectionType } from '../../src/connection/IConnection'
import { DhtAddress, toNodeId } from '../../src/identifiers'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { Message, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MetricsContext, until } from '@streamr/utils'
import { ConnectionStatistics } from '../../src/connection/ConnectionStatistics'
import { createMockPeerDescriptor } from '../utils/utils'

const createConnectionManager = (
    localPeerDescriptor: PeerDescriptor,
    transport: ITransport,
    facadeOptions: Partial<ConstructorParameters<typeof DefaultConnectorFacade>[0]> = {}
) => {
    return new ConnectionManager({
        createConnectorFacade: () => new DefaultConnectorFacade({
            transport,
            createLocalPeerDescriptor: async () => localPeerDescriptor,
            ...facadeOptions
        }),
        metricsContext: new MetricsContext(),
        allowIncomingPrivateConnections: false,
        statisticsInterval: 20
    })
}

describe('WebRTC Connection Management', () => {

    let manager1: ConnectionManager
    let manager2: ConnectionManager
    let simulator: Simulator
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    let connectorTransport1: SimulatorTransport
    let connectorTransport2: SimulatorTransport

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.FIXED, 20)
        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await connectorTransport1.start()
        manager1 = createConnectionManager(peerDescriptor1, connectorTransport1)
        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await connectorTransport2.start()
        manager2 = createConnectionManager(peerDescriptor2, connectorTransport2)
        await manager1.start()
        await manager2.start()
    })

    afterEach(async () => {
        await Promise.all([
            manager1.stop(),
            manager2.stop(),
            connectorTransport1.stop(),
            connectorTransport2.stop()
        ])
        simulator.stop()
    })

    const serviceId = 'dummy'

    // TODO: fix flaky test, ticket NET-911
    it('Peer1 can open WebRTC Datachannels', (done) => {
        const dummyMessage: Message = {
            serviceId: 'unknown',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer'
        }

        manager2.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')

            done()
        })
        dummyMessage.targetDescriptor = peerDescriptor2
        manager1.send(dummyMessage).catch((e) => {
            throw e
        })
    }, 15000)

    it('Peer2 can open WebRTC Datachannel', (done) => {
        const dummyMessage: Message = {
            serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }, 
            messageId: 'mockerer'
        }
        manager1.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            done()
        })
        dummyMessage.targetDescriptor = peerDescriptor1
        manager2.send(dummyMessage)
    }, 60000)

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer'
        }
        dummyMessage.targetDescriptor = peerDescriptor1
        await expect(manager1.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })

    it('Connects and disconnects webrtc connections', async () => {
        const msg: Message = {
            serviceId,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }

        const dataPromise = new Promise<void>((resolve, _reject) => {
            manager2.on('message', async (message: Message) => {
                expect(message.body.oneofKind).toBe('rpcMessage')
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('connected', () => {
                //expect(message.body.oneofKind).toBe('rpcMessage')
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('connected', () => {
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', () => {
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('disconnected', () => {
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg).catch((_e) => { })

        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])

        // @ts-expect-error private field
        manager1.closeConnection(peerDescriptor2)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])

    }, 20000)

    it('getConnectionInfos reports webrtc connections with peer nodeIds', async () => {
        const msg: Message = {
            serviceId,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }
        const connectedPromise1 = new Promise<void>((resolve) => manager1.on('connected', () => resolve()))
        const connectedPromise2 = new Promise<void>((resolve) => manager2.on('connected', () => resolve()))
        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg).catch(() => {})
        await Promise.all([connectedPromise1, connectedPromise2])

        const infos1 = await manager1.getConnectionInfos()
        expect(infos1).toHaveLength(1)
        expect(infos1[0].nodeId).toEqual(toNodeId(peerDescriptor2))
        expect(infos1[0].type).toEqual(ConnectionType.WEBRTC)
        const infos2 = await manager2.getConnectionInfos()
        expect(infos2).toHaveLength(1)
        expect(infos2[0].nodeId).toEqual(toNodeId(peerDescriptor1))
        expect(infos2[0].type).toEqual(ConnectionType.WEBRTC)
    }, 20000)

    it('statisticsUpdated flows over webrtc and the send queue grows under a burst', async () => {
        const stats1: ConnectionStatistics[] = []
        const stats2: ConnectionStatistics[] = []
        manager1.on('statisticsUpdated', (_peerDescriptor: PeerDescriptor, statistics: ConnectionStatistics, nodeId: DhtAddress) => {
            expect(nodeId).toEqual(toNodeId(peerDescriptor2))
            stats1.push(statistics)
        })
        manager2.on('statisticsUpdated', (_peerDescriptor: PeerDescriptor, statistics: ConnectionStatistics) => {
            stats2.push(statistics)
        })
        const connectedPromise1 = new Promise<void>((resolve) => manager1.on('connected', () => resolve()))
        const connectedPromise2 = new Promise<void>((resolve) => manager2.on('connected', () => resolve()))
        manager1.send({
            serviceId,
            messageId: 'burst-0',
            body: { oneofKind: 'rpcMessage', rpcMessage: RpcMessage.create() },
            targetDescriptor: peerDescriptor2
        }).catch(() => {})
        await Promise.all([connectedPromise1, connectedPromise2])

        // 300 x 16 KB synchronously: far above the 128 KB datachannel watermark,
        // so the sender's queue must fill and later drain; unique messageIds
        // keep the receiver's duplicate detector from dropping them
        for (let i = 1; i <= 300; i++) {
            manager1.send({
                serviceId,
                messageId: `burst-${i}`,
                body: {
                    oneofKind: 'rpcMessage',
                    rpcMessage: { ...RpcMessage.create(), body: { typeUrl: 'burst', value: new Uint8Array(16 * 1024) } }
                },
                targetDescriptor: peerDescriptor2
            }).catch(() => {})
        }
        await until(() => stats1.some((s) => (s.offeredBytesPerSecond > 0) && ((s.queuedMessages > 0) || (s.bufferedAmount > 0))), 10000)
        await until(() => {
            const latest = stats1[stats1.length - 1]
            return (latest?.queuedMessages === 0) && (latest.bufferedAmount === 0)
        }, 20000)
        await until(() => stats2.some((s) => s.receivedBytesPerSecond > 0), 10000)
        const peak = stats1.reduce((max, s) => Math.max(max, s.backlogBytes), 0)
        expect(peak).toBeGreaterThan(0)
        expect(stats1.every((s) => s.backlogBytes === s.queuedBytes + s.bufferedAmount)).toBe(true)
    }, 40000)

    it('failed connections are cleaned up', async () => {
        const msg: Message = {
            serviceId,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', () => {
                resolve()
            })
        })

        msg.targetDescriptor = createMockPeerDescriptor()
        
        await Promise.allSettled([
            manager1.send(msg),
            disconnectedPromise1
        ])
    }, 20000)

    describe('media channel', () => {

        const connect = async (sender: ConnectionManager, target: PeerDescriptor) => {
            const connectedPromise = new Promise<void>((resolve) => sender.on('connected', () => resolve()))
            sender.send({
                serviceId,
                messageId: 'media-0',
                body: { oneofKind: 'rpcMessage', rpcMessage: RpcMessage.create() },
                targetDescriptor: target
            }).catch(() => {})
            await connectedPromise
        }

        const burst = (sender: ConnectionManager, target: PeerDescriptor, hint?: { channel: 'media' }) => {
            for (let i = 1; i <= 50; i++) {
                sender.send({
                    serviceId,
                    messageId: `media-${i}`,
                    body: {
                        oneofKind: 'rpcMessage',
                        rpcMessage: { ...RpcMessage.create(), body: { typeUrl: 'media', value: new Uint8Array(8 * 1024) } }
                    },
                    targetDescriptor: target
                }, hint ? { sendQueueHint: hint } : undefined).catch(() => {})
            }
        }

        it('both ends capable: the media channel opens and media-hinted sends use it', async () => {
            const stats1: ConnectionStatistics[] = []
            manager1.on('statisticsUpdated', (_pd: PeerDescriptor, statistics: ConnectionStatistics) => {
                stats1.push(statistics)
            })
            const received: Message[] = []
            manager2.on('message', (message: Message) => {
                if (message.serviceId === serviceId) {
                    received.push(message)
                }
            })
            await connect(manager1, peerDescriptor2)
            // the media channel is created after the handshake (so a send right at
            // 'connected' still goes reliable) and shows up in the breakdown once open
            await until(() => stats1.some((s) => s.channels?.media !== undefined), 10000)
            burst(manager1, peerDescriptor2, { channel: 'media' })
            await until(() => stats1.some((s) => (s.channels?.media?.offeredBytesPerSecond ?? 0) > 0), 10000)
            await until(() => received.length >= 50, 20000)
            const latest = stats1[stats1.length - 1]
            expect(latest.channels?.reliable).toBeDefined()
            const infos = await manager1.getConnectionInfos()
            expect(infos.length).toBeGreaterThan(0)
        }, 40000)

        it('a peer without the capability keeps a single reliable channel and still receives media-hinted sends', async () => {
            // manager2 is the "old" peer: it neither advertises nor accepts the media channel
            const oldManager2 = manager2
            await oldManager2.stop()
            // eslint-disable-next-line require-atomic-updates
            manager2 = createConnectionManager(peerDescriptor2, connectorTransport2, { webrtcMediaChannel: { enabled: false } })
            await manager2.start()
            const stats1: ConnectionStatistics[] = []
            manager1.on('statisticsUpdated', (_pd: PeerDescriptor, statistics: ConnectionStatistics) => {
                stats1.push(statistics)
            })
            const received: Message[] = []
            manager2.on('message', (message: Message) => {
                if (message.serviceId === serviceId) {
                    received.push(message)
                }
            })
            await connect(manager1, peerDescriptor2)
            burst(manager1, peerDescriptor2, { channel: 'media' })
            await until(() => received.length >= 50, 20000)
            // a second of statistics after everything arrived: still no media channel anywhere
            await new Promise((resolve) => setTimeout(resolve, 1000))
            expect(stats1.every((s) => s.channels === undefined)).toBe(true)
        }, 40000)
    })
})
