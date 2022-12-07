import { Wallet } from 'ethers'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { ConfigTest } from '../../src/ConfigTest'
import { PermissionAssignment, StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream } from '../test-utils/utils'
import { waitForCondition } from '@streamr/utils'
import { PeerID } from '@streamr/dht'

const TIMEOUT = 60 * 1000

const PAYLOAD = { hello: 'world' }

async function createStreamWithPermissions(
    privateKey: string,
    ...assignments: PermissionAssignment[]
): Promise<Stream> {
    const creatorClient = new StreamrClient({
        ...ConfigTest,
        auth: {
            privateKey
        }
    })
    try {
        const stream = await createTestStream(creatorClient, module)
        await stream.grantPermissions(...assignments)
        return stream
    } finally {
        await creatorClient.destroy()
    }
}

describe('publish-subscribe', () => {
    let subscriberWallet: Wallet
    let publisherPk: string
    let publisherClient: StreamrClient
    let subscriberClient: StreamrClient
    let entryPointWallet: Wallet
    let entryPointClient: StreamrClient

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherPk = await fetchPrivateKeyWithGas()
        entryPointWallet = new Wallet((await fetchPrivateKeyWithGas()))
    })

    beforeEach(async () => {
        const entryPoint = {
            kademliaId: PeerID.fromString('entryPoint').toString(),
            type: 0,
            websocket: {
                ip: 'localhost',
                port: 15655
            }
        }

        entryPointClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: entryPointWallet.privateKey
            },
            network: {
                entryPoints: [entryPoint],
                peerDescriptor: entryPoint
            }
        })

        publisherClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: publisherPk
            },
            network: {
                entryPoints: [entryPoint],
                peerDescriptor: {
                    kademliaId: 'publisher',
                    type: 0
                }
            }
        })
        subscriberClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: subscriberWallet.privateKey
            },
            network: {
                entryPoints: [entryPoint],
                peerDescriptor: {
                    kademliaId: 'subscriber',
                    type: 0
                }
            }
        })

    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            subscriberClient?.destroy(),
        ])
    }, TIMEOUT)

    describe('private stream', () => {
        let stream: Stream

        beforeAll(async () => {
            stream = await createStreamWithPermissions(publisherPk, {
                permissions: [StreamPermission.SUBSCRIBE],
                user: subscriberWallet.address
            })

        }, TIMEOUT)

        it('subscriber is able to receive and decrypt messages', async () => {
            await entryPointClient.subscribe(stream.id, (_msg: any) => {})

            const messages: any[] = []
            await publisherClient.publish(stream.id, PAYLOAD)
            const sub = await subscriberClient.subscribe(stream.id, (msg: any) => {
                messages.push(msg)
            })
            sub.on('error', (e) =>  console.error(e))
            await waitForCondition(() => messages.length > 0)
            expect(messages).toEqual([PAYLOAD])

        }, TIMEOUT)
    })

})
