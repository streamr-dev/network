import { MetricsContext, wait } from '@streamr/utils'
import {
    ConnectionManager,
    DefaultConnectorFacade,
    DhtNode,
    NodeType,
    PeerID,
} from '../../src/exports'
import {
    MessageType,
    PeerDescriptor,
} from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '@streamr/proto-rpc/dist/src/proto/ProtoRpc'
import { ClientWebsocket } from '../../src/connection/websocket/ClientWebsocket'

jest.mock('../../src/connection/websocket/ClientWebsocket', () => {
    const actualUtils = jest.requireActual(
        '../../src/connection/websocket/ClientWebsocket'
    )

    return {
        __esModule: true,
        ...actualUtils,
        ClientWebsocket: jest.fn().mockImplementation((...args: any[]) => {
            return new actualUtils.ClientWebsocket(...args)
        }),
    }
})

/**
 * Forges a connection manager. It's real!
 */
function forge(id: string, { portOffset = 0 } = {}) {
    const pd: PeerDescriptor = {
        kademliaId: PeerID.fromString(`pd-${id}`).value,
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 43432 + portOffset,
            tls: false,
        },
    }

    const conman = new ConnectionManager({
        metricsContext: new MetricsContext(),
        createConnectorFacade() {
            return new DefaultConnectorFacade({
                transport: new DhtNode({}),
                websocketPortRange: {
                    min: 43432 + portOffset,
                    max: 43432 + portOffset,
                },
                createLocalPeerDescriptor: () => pd,
                entryPoints: [pd],
                websocketServerEnableTls: pd.websocket?.tls === true,
            })
        },
    })

    return conman
}

/**
 * Sends a message between connection managers, and by default waits
 * for the response. You can mod or skip the waiting.
 */
async function send(
    messageId: string,
    sender: ConnectionManager,
    target: ConnectionManager,
    onWait?: (awaiter: Promise<void>) => void | Promise<void>
) {
    const recv = new Promise<void>((resolve) => {
        target.on('message', (msg) => {
            if (msg.messageId === messageId) {
                resolve()
            }
        })
    })

    await sender.send({
        serviceId: 'serviceId',
        messageType: MessageType.RPC,
        messageId,
        body: {
            oneofKind: 'rpcMessage',
            rpcMessage: RpcMessage.create(),
        },
        targetDescriptor: target.getLocalPeerDescriptor(),
    })

    if (onWait) {
        await onWait(recv)
    } else {
        await recv
    }
}

const { ClientWebsocket: ActualClientWebsocket } = jest.requireActual(
    '../../src/connection/websocket/ClientWebsocket'
)

function mockClientWebsocketOnce(
    modder: (cws: typeof ActualClientWebsocket) => void
) {
    // @ts-expect-error TS doesn't know ClientWebsocket is a mock.
    ClientWebsocket.mockImplementationOnce((...args: any[]) => {
        const wsClient = new ActualClientWebsocket(...args)

        modder(wsClient)

        return wsClient
    })
}

describe('Websocket client recovery', () => {
    jest.setTimeout(30000)

    let conmans: ConnectionManager[] = []

    beforeEach(async () => {
        jest.clearAllMocks()

        conmans = [...Array(2)].map((_, i) =>
            forge(`peer-${i}`, { portOffset: i })
        )

        for (const conman of conmans) {
            /**
             * Start all connection managers. We're all prepped for testing
             * them after this.
             */
            await conman.start()
        }
    })

    afterEach(async () => {
        /**
         * Clean-up connection managers and reset the collection. Prep
         * for another round.
         */
        for (const conman of conmans) {
            await conman.stop()
        }

        conmans = []
    })

    it('recovers from a regular ws client hiccup', async () => {
        /**
         * This tests proves that the manager can successfully recover from a lost
         * websocket client connection.
         */

        const [cm0, cm1] = conmans

        await send('test0', cm0, cm1)

        await send('test1', cm0, cm1)

        /**
         * We've sent 2 messages. Both got through. Now the fun part: taking
         * the client down. What's gonna happen?
         */

        const conn = cm0.getConnection(cm1.getLocalPeerDescriptor())

        if (!conn) {
            throw new Error('No connection between cm0 and cm1')
        }

        // @ts-expect-error Using private property: implementation.
        const firstWsClient = conn.implementation

        expect(firstWsClient).toBeInstanceOf(ActualClientWebsocket)

        if (!firstWsClient) {
            throw new Error('No first ws client')
        }

        const wsNotified = new Promise<void>((resolve) => {
            firstWsClient.once('disconnected', () => {
                resolve()
            })
        })

        const connNotifiedInternally = new Promise<void>((resolve) => {
            // @ts-expect-error Using private property: outputBufferEmitter.
            conn.outputBufferEmitter.once('bufferSendingFailed', () => {
                resolve()
            })
        })

        const connNotifiedExternally = Promise.race([
            /**
             * 1000ms is a huge exaggeration. It should emit
             * the event instantly.
             */
            wait(1000).then(() => {
                throw new Error('Too late!')
            }),
            new Promise<void>((resolve) => {
                conn.once('disconnected', () => {
                    resolve()
                })
            }),
        ])

        // @ts-expect-error Using private property: destroyed.
        expect(firstWsClient.destroyed).toBe(false)

        // @ts-expect-error Using private property: socket.
        firstWsClient.socket.close()

        /**
         * Closing the socket emits a disconnection error
         * on the ws client immediately, pretty much.
         */
        await wsNotified

        // @ts-expect-error Using private property: destroyed.
        expect(firstWsClient.destroyed).toBe(true)

        /**
         * When ws client disconnects it informs the managed
         * connection right away, too.
         */
        await connNotifiedInternally

        /**
         * ManagedConnection's internal_disconnected is not enough to propagate
         * the event further up. Currently ManagedConnection has to be told to
         * propagate up.
         *
         * We expect the conneciton to immediately push the news up!
         */
        await connNotifiedExternally

        /**
         * At this point the connection is useless and since we've notified
         * ConnectionManager about it it'll clean up and let us send new
         * messages through new connection.
         */

        await send('test2', cm0, cm1)

        const secondWsClient =
            // @ts-expect-error Using private property: implementation.
            cm0.getConnection(cm1.getLocalPeerDescriptor()).implementation

        expect(secondWsClient).toBeInstanceOf(ActualClientWebsocket)

        expect(secondWsClient).not.toEqual(firstWsClient)
    })

    it('recovers from a pre-init ws client hiccup (close before handshake)', async () => {
        /**
         * This test aims to check if we can recover from a websocket client
         * connection closed before getting the handshake.
         */

        const [cm0, cm1] = conmans

        let firstWsClient: ClientWebsocket | undefined

        mockClientWebsocketOnce((wsClient) => {
            wsClient.connect = (address: string, ...rest: any[]) => {
                const result = wsClient.constructor.prototype.connect.bind(
                    wsClient
                )(address, ...rest)

                wsClient.once('connected', () => {
                    wsClient.socket.close()
                })

                return result
            }

            firstWsClient = wsClient
        })

        const connNotifiedExternally = Promise.race([
            /**
             * 1000ms is a huge exaggeration. It should emit
             * the error instantly.
             */
            wait(1000).then(() => {
                throw new Error('Too late!')
            }),
            new Promise<void>((resolve) => {
                cm0.once('disconnected', () => {
                    resolve()
                })
            }),
        ])

        await expect(
            send('test0', cm0, cm1, () => {
                /* Don't wait. This message is lost, unfortunately. */
            })
        ).rejects.toThrow(/sending buffer failed/i)

        await connNotifiedExternally

        await send('test1', cm0, cm1)

        const secondWsClient =
            // @ts-expect-error Using private property: implementation.
            cm0.getConnection(cm1.getLocalPeerDescriptor()).implementation

        expect(secondWsClient).toBeInstanceOf(ActualClientWebsocket)

        expect(firstWsClient).toBeInstanceOf(ActualClientWebsocket)

        expect(secondWsClient).not.toEqual(firstWsClient)
    })

    it('recovers from a pre-init ws client hiccup (fail to connect at first)', async () => {
        /**
         * This test aims to check if the second attempt to send a messages recovers
         * a connection that failed to take off at first completely.
         */

        const [cm0, cm1] = conmans

        let firstWsClient: ClientWebsocket | undefined

        mockClientWebsocketOnce((wsClient) => {
            wsClient.connect = (address: string, ...rest: any[]) =>
                wsClient.constructor.prototype.connect.bind(wsClient)(
                    address.replace(/^ws:/i, 'wss:'),
                    ...rest
                )

            firstWsClient = wsClient
        })

        const connNotifiedExternally = Promise.race([
            /**
             * 1000ms is a huge exaggeration. It should emit
             * the error instantly.
             */
            wait(1000).then(() => {
                throw new Error('Too late!')
            }),
            new Promise<void>((resolve) => {
                cm0.once('disconnected', () => {
                    resolve()
                })
            }),
        ])

        await expect(
            send('test0', cm0, cm1, () => {
                /* Don't wait. This message is lost, unfortunately. */
            })
        ).rejects.toThrow(/sending buffer failed/i)

        await connNotifiedExternally

        await send('test1', cm0, cm1)

        const secondWsClient =
            // @ts-expect-error Using private property: implementation.
            cm0.getConnection(cm1.getLocalPeerDescriptor()).implementation

        expect(secondWsClient).toBeInstanceOf(ActualClientWebsocket)

        expect(firstWsClient).toBeInstanceOf(ActualClientWebsocket)

        expect(secondWsClient).not.toEqual(firstWsClient)
    })
})
