import { range } from 'lodash'
import { StreamMessage } from 'streamr-client-protocol'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream } from '../test-utils/utils'
import { getPublishTestStreamMessages, getWaitForStorage } from '../test-utils/publish'
import { StreamPermission } from '../../src/permission'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { fastWallet } from 'streamr-test-utils'

const NUM_MESSAGES = 8
const PARTITIONS = 3

describe('resend all partitions', () => {
    let client: StreamrClient
    let stream: Stream
    let publishTestMessages: ReturnType<typeof getPublishTestStreamMessages>
    let waitForStorage: (...args: any[]) => Promise<void>

    // note: test order matters
    // reuses same stream across tests
    beforeAll(async () => {
        const environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await createTestStream(client, module, {
            partitions: PARTITIONS,
        })
        const storageNode = environment.startStorageNode()
        await stream.addToStorageNode(storageNode.id)
        const publisherWallet = fastWallet()
        /*
        TODO use encryption when the bug in pullManyToOne has been fixed (https://github.com/streamr-dev/network-monorepo/pull/583)
        -> enable it by replacing the grantPermissions call with this
        await stream.grantPermissions({
            user: publisherWallet.address,
            permissions: [StreamPermission.PUBLISH]
        })*/
        await stream.grantPermissions({
            public: true,
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
        })
        publishTestMessages = getPublishTestStreamMessages(environment.createClient({
            auth: {
                privateKey: publisherWallet.privateKey
            }
        }), stream.id)
        waitForStorage = getWaitForStorage(client, {
            stream
        })
    })

    afterAll(async () => {
        await client?.destroy()
    })

    // must run before publishing any data
    describe('no data', () => {
        it('handles nothing to resend', async () => {
            const sub = await client.resendAll(stream.id, {
                last: 5,
            })

            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(0)
        })
    })

    describe('with resend data', () => {
        let published: StreamMessage[]

        beforeEach(async () => {
            if (published && published.length) { return }
            const pubs = await Promise.all(range(PARTITIONS).map((streamPartition) => {
                return publishTestMessages(NUM_MESSAGES, { partitionKey: streamPartition })
            }))
            // eslint-disable-next-line require-atomic-updates
            published = pubs.flat()
            // ensure last message is in storage
            await waitForStorage(published[published.length - 1])
        })

        it('gives zero results for last 0', async () => {
            const sub = await client.resendAll(stream.id, {
                last: 0
            })
            const receivedMsgs = await sub.collect()
            expect(receivedMsgs).toHaveLength(0)
        })

        describe('last', () => {
            it('can resend all', async () => {
                const sub = await client.resendAll(stream.id, {
                    last: published.length
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(published.length)
                expect(receivedMsgs.map((m) => m.signature)).toIncludeSameMembers(published.map((m) => m.signature))
            })

            it('can resend subset', async () => {
                const sub = await client.resendAll(stream.id, {
                    last: 2
                })

                const receivedMsgs = await sub.collect()
                expect(receivedMsgs).toHaveLength(2 * PARTITIONS)
            })
        })
    })
})
