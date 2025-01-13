import { fastPrivateKey, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { wait, until } from '@streamr/utils'
import { randomBytes } from 'crypto'
import random from 'lodash/random'
import range from 'lodash/range'
import shuffle from 'lodash/shuffle'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { StreamPermission } from '../../src/permission'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestClient, createTestStream } from '../test-utils/utils'

const NUM_OF_MESSAGES = 20
const MESSAGE_STORE_TIMEOUT = 10 * 1000
const TIMEOUT = 60 * 1000

describe('resend', () => {
    let publisherClient: StreamrClient
    let resendClient: StreamrClient
    let payloads: (Uint8Array | { idx: number })[]

    beforeEach(async () => {
        publisherClient = createTestClient(await fetchPrivateKeyWithGas(), 43232)
        resendClient = createTestClient(fastPrivateKey(), 43233)
        const binaryPayloads = range(NUM_OF_MESSAGES / 2).map(() => randomBytes(random(0, 256)))
        const jsonPayloads = range(NUM_OF_MESSAGES / 2).map((idx) => ({ idx }))
        payloads = shuffle([...binaryPayloads, ...jsonPayloads])
    }, TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([publisherClient.destroy(), resendClient.destroy()])
    }, TIMEOUT)

    describe('non-public stream', () => {
        let stream: Stream

        beforeEach(async () => {
            stream = await createTestStream(publisherClient, module, { partitions: 3 })
            await stream.grantPermissions({
                permissions: [StreamPermission.SUBSCRIBE],
                userId: await resendClient.getUserId()
            })
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE, { wait: true })
            for (const payload of payloads) {
                await publisherClient.publish({ id: stream.id, partition: 0 }, payload)
            }
            await wait(MESSAGE_STORE_TIMEOUT)
        }, TIMEOUT)

        it(
            'can request resend for all messages',
            async () => {
                const messages: unknown[] = []
                await resendClient.resend(
                    {
                        streamId: stream.id,
                        partition: 0
                    },
                    { last: NUM_OF_MESSAGES },
                    (msg: any) => {
                        messages.push(msg)
                    }
                )
                await until(
                    () => messages.length >= NUM_OF_MESSAGES,
                    TIMEOUT - 1000,
                    250,
                    undefined,
                    () => `messages array length was ${messages.length}`
                )
                expect(messages).toHaveLength(NUM_OF_MESSAGES)
                expect(messages).toEqual(payloads)
            },
            TIMEOUT
        )
    })
})
