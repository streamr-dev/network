import 'reflect-metadata'
import { MessageID, StreamMessage } from 'streamr-client-protocol'
import { DOCKER_DEV_STORAGE_NODE } from '../../src/ConfigTest'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { createClientFactory } from '../test-utils/fake/fakeEnvironment'
import { createRelativeTestStreamId } from '../test-utils/utils'

describe('Resends', () => {

    describe('waitForStorage', () => {

        let client: StreamrClient
        let stream: Stream

        beforeEach(async () => {
            client = createClientFactory().createClient()
            stream = await client.createStream({
                id: await createRelativeTestStreamId(module),
            })
        })

        it('happy path', async () => {
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            const mockId = Date.now()
            const msg = new StreamMessage({
                messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                content: {
                    mockId
                }
            })
            const publishedMsg = await client.publish(stream.id, msg.getParsedContent())
            await client.waitForStorage(publishedMsg)
        })

        it('no match', async () => {
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            const msg = new StreamMessage({
                messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                content: {}
            })
            const publishedMsg = await client.publish(stream.id, msg.getParsedContent())
            const messageMatchFn = jest.fn().mockReturnValue(false)
            await expect(() => client.waitForStorage(msg, {
                interval: 50,
                timeout: 100,
                count: 1,
                messageMatchFn
            })).rejects.toThrow('timed out')
            expect(messageMatchFn).toHaveBeenCalledWith(expect.anything(), publishedMsg)
        })

        it('no message', async () => {
            await stream.addToStorageNode(DOCKER_DEV_STORAGE_NODE)
            const msg = new StreamMessage({
                messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                content: {}
            })
            await expect(() => client.waitForStorage(msg, {
                interval: 50,
                timeout: 100,
                count: 1,
                messageMatchFn: () => {
                    return true
                }
            })).rejects.toThrow('timed out')
        })

        it('no storage assigned', async () => {
            const msg = new StreamMessage({
                messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                content: {}
            })
            await expect(() => client.waitForStorage(msg, {
                messageMatchFn: () => {
                    return true
                }
            })).rejects.toThrow('no storage assigned')
        })
    })
})
