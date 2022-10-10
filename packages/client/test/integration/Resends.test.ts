import 'reflect-metadata'
import { MessageID } from 'streamr-client-protocol'
import { Authentication } from '../../src/Authentication'
import { StreamPermission } from '../../src/permission'
import { createSignedMessage } from '../../src/publish/MessageFactory'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { createRandomAuthentication, createRelativeTestStreamId } from '../test-utils/utils'

describe('Resends', () => {

    describe('waitForStorage', () => {

        let client: StreamrClient
        let stream: Stream
        let storageNode: FakeStorageNode
        let authentication: Authentication

        beforeEach(async () => {
            authentication = createRandomAuthentication()
            const environment = new FakeEnvironment()
            client = environment.createClient()
            stream = await client.createStream({
                id: createRelativeTestStreamId(module),
            })
            await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
            storageNode = environment.startStorageNode()
        })

        it('happy path', async () => {
            await stream.addToStorageNode(storageNode.id)
            const content = {
                foo: Date.now()
            }
            const publishedMsg = await client.publish(stream.id, content)
            await client.waitForStorage(publishedMsg)
        })

        it('no match', async () => {
            await stream.addToStorageNode(storageNode.id)
            const content = {
                foo: Date.now()
            }
            const publishedMsg = await client.publish(stream.id, content)
            const messageMatchFn = jest.fn().mockReturnValue(false)
            await expect(() => client.waitForStorage(publishedMsg, {
                interval: 50,
                timeout: 100,
                count: 1,
                messageMatchFn
            })).rejects.toThrow('timed out')
            expect(messageMatchFn).toHaveBeenCalledWith(expect.anything(), expect.anything())
            expect(messageMatchFn.mock.calls[0][0].getParsedContent()).toEqual(content)
            expect(messageMatchFn.mock.calls[0][1].getParsedContent()).toEqual(content)
        })

        it('no message', async () => {
            await stream.addToStorageNode(storageNode.id)
            const msg = await createSignedMessage({
                messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                serializedContent: JSON.stringify({}),
                authentication
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
            const msg = await createSignedMessage({
                messageId: new MessageID(stream.id, 0, Date.now(), 0, 'publisherId', 'msgChainId'),
                serializedContent: JSON.stringify({}),
                authentication
            })
            await expect(() => client.waitForStorage(msg, {
                messageMatchFn: () => {
                    return true
                }
            })).rejects.toThrow('no storage assigned')
        })
    })
})
