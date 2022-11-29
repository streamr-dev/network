import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { createTestStream } from '../test-utils/utils'
import { range } from 'lodash'
import { ConfigTest, DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { wait, waitForCondition } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'

const NUM_OF_MESSAGES = 20
const MESSAGE_STORE_TIMEOUT = 9 * 1000
const TIMEOUT = 30 * 1000

describe('resend', () => {
    let publisherClient: StreamrClient
    let resendClient: StreamrClient

    beforeEach(async () => {
        publisherClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: await fetchPrivateKeyWithGas()
            },
            network: {
                entryPoints: [{
                    kademliaId: "entryPointBroker",
                    type: 0,
                    websocket: {
                        ip: "127.0.0.1",
                        port: 40401
                    }
                }],
                peerDescriptor: {
                    kademliaId: "resend-e2e-publisher-client",
                    type: 0,
                    websocket: {
                        ip: '127.0.0.1',
                        port: 43232
                    }
                }
            },

        })
        resendClient = new StreamrClient({
            ...ConfigTest,
            auth: {
                privateKey: fastPrivateKey()
            },
            network: {
                entryPoints: [{
                    kademliaId: "entryPointBroker",
                    type: 0,
                    websocket: {
                        ip: "127.0.0.1",
                        port: 40401
                    }
                }],
                peerDescriptor: {
                    kademliaId: "resend-e2e-resend-client",
                    type: 0,
                    websocket: {
                        ip: '127.0.0.1',
                        port: 43233
                    }
                }
            }
        })
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            publisherClient?.destroy(),
            resendClient?.destroy(),
        ])
    }, TIMEOUT)

    describe('non-public stream', () => {
        let stream: Stream

        beforeEach(async () => {
            stream = await createTestStream(publisherClient, module, { partitions: 3 })
            await stream.grantPermissions({
                permissions: [StreamPermission.SUBSCRIBE],
                user: await resendClient.getAddress()
            })
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            await wait(2500)
            for (const idx of range(NUM_OF_MESSAGES)) {
                await publisherClient.publish({
                    id: stream.id,
                    partition: 0,
                }, {
                    messageNo: idx
                })
                console.log(idx)
            }
            await wait(MESSAGE_STORE_TIMEOUT)
        }, TIMEOUT)

        it('can request resend for all messages', async () => {
            const messages: unknown[] = []
            await resendClient.resend({
                streamId: stream.id,
                partition: 0
            }, { last: NUM_OF_MESSAGES }, (msg: any) => {
                messages.push(msg)
                console.log(msg)
            })
            await waitForCondition(
                () => messages.length >= NUM_OF_MESSAGES,
                TIMEOUT - 1000,
                250,
                undefined,
                () => `messages array length was ${messages.length}`
            )
            expect(messages).toHaveLength(NUM_OF_MESSAGES)
        }, TIMEOUT)
    })
})
