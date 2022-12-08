import { Wallet } from '@ethersproject/wallet'
import StreamrClient, { Stream, StreamPermission } from 'streamr-client'
import { fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, waitForCondition } from '@streamr/utils'
import { Broker } from '../../src/broker'
import { startBroker, createClient, createTestStream } from '../utils'

jest.setTimeout(30000)

const httpPort = 17712

describe('local propagation', () => {
    let broker: Broker
    let privateKey: string
    let client1: StreamrClient
    let client2: StreamrClient
    let freshStream: Stream
    let freshStreamId: string
    let brokerWallet: Wallet

    beforeAll(async () => {
        privateKey = await fetchPrivateKeyWithGas()
        brokerWallet = new Wallet(await fetchPrivateKeyWithGas())

        broker = await startBroker({
            privateKey: brokerWallet.privateKey,
            httpPort,
            wsServerPort: 44402
        })

        const entryPoints = [{
            kademliaId: (await brokerWallet.getAddress()),
            type: 0,
            websocket: {
                ip: '127.0.0.1',
                port: 44402
            }
        }]

        client1 = await createClient(privateKey, {
            network: {
                layer0: {
                    peerDescriptor: {
                        kademliaId: 'local-propagation-client-1',
                        type: 0,
                        websocket: {
                            ip: '127.0.0.1',
                            port: 44403
                        }
                    },
                    entryPoints
                }
            }
        })
        client2 = await createClient(privateKey, {
            network: {
                layer0: {
                    peerDescriptor: {
                        kademliaId: 'local-propagation-client-2',
                        type: 0,
                        websocket: {
                            ip: '127.0.0.1',
                            port: 44404
                        }
                    },
                    entryPoints
                }
            }
        })
    })

    beforeEach(async () => {
        freshStream = await createTestStream(client1, module)
        freshStreamId = freshStream.id
        await freshStream.grantPermissions({ permissions: [StreamPermission.PUBLISH], user: brokerWallet.address })

        await wait(3000)
    })

    afterAll(async () => {
        await Promise.all([
            client1.destroy(),
            client2.destroy(),
            broker.stop()
        ])
    })

    // What exactly is this testing in the broker?
    test.skip('local propagation using StreamrClients', async () => {
        const client1Messages: any[] = []
        const client2Messages: any[] = []

        await Promise.all([
            client1.subscribe({
                stream: freshStreamId
            }, (message) => {
                client1Messages.push(message)
            }),
            client2.subscribe({
                stream: freshStreamId
            }, (message) => {
                client2Messages.push(message)
            })
        ])

        await client1.publish(freshStreamId, {
            key: 1
        })
        await client1.publish(freshStreamId, {
            key: 2
        })
        await client1.publish(freshStreamId, {
            key: 3
        })

        await waitForCondition(() => client2Messages.length === 3)
        await waitForCondition(() => client1Messages.length === 3)

        expect(client1Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])

        expect(client2Messages).toEqual([
            {
                key: 1
            },
            {
                key: 2
            },
            {
                key: 3
            },
        ])
    })
})
