import 'reflect-metadata'

import { convertStreamMessageToMessage } from '../../src/Message'
import { Stream } from '../../src/Stream'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamrClientError } from '../../src/StreamrClientError'
import { StreamPermission } from '../../src/permission'
import { MessageSigner } from '../../src/signature/MessageSigner'
import { FakeEnvironment } from '../test-utils/fake/FakeEnvironment'
import { FakeStorageNode } from '../test-utils/fake/FakeStorageNode'
import { MOCK_CONTENT, createRandomAuthentication, createRelativeTestStreamId } from '../test-utils/utils'
import { MessageID } from './../../src/protocol/MessageID'
import { ContentType, EncryptionType, SignatureType, StreamMessageType } from './../../src/protocol/StreamMessage'
import { randomUserId } from '@streamr/test-utils'

const PUBLISHER_ID = randomUserId()

describe('waitForStorage', () => {
    let client: StreamrClient
    let stream: Stream
    let storageNode: FakeStorageNode
    let messageSigner: MessageSigner
    let environment: FakeEnvironment

    beforeEach(async () => {
        messageSigner = new MessageSigner(createRandomAuthentication())
        environment = new FakeEnvironment()
        client = environment.createClient()
        stream = await client.createStream({
            id: createRelativeTestStreamId(module)
        })
        await stream.grantPermissions({ permissions: [StreamPermission.SUBSCRIBE], public: true })
        storageNode = await environment.startStorageNode()
    })

    afterEach(async () => {
        await environment.destroy()
    })

    it('happy path', async () => {
        await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
        const content = {
            foo: Date.now()
        }
        const publishedMsg = await client.publish(stream.id, content)
        await client.waitForStorage(publishedMsg)
    })

    it('no match', async () => {
        await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
        const content = {
            foo: Date.now()
        }
        const publishedMsg = await client.publish(stream.id, content)
        const messageMatchFn = jest.fn().mockReturnValue(false)
        await expect(() =>
            client.waitForStorage(publishedMsg, {
                interval: 50,
                timeout: 100,
                count: 1,
                messageMatchFn
            })
        ).rejects.toThrow('timed out')
        expect(messageMatchFn).toHaveBeenCalledWith(expect.anything(), expect.anything())
        expect(messageMatchFn.mock.calls[0][0].content).toEqual(content)
        expect(messageMatchFn.mock.calls[0][1].content).toEqual(content)
    })

    it('no message', async () => {
        await stream.addToStorageNode(storageNode.getAddress(), { wait: true })
        const msg = convertStreamMessageToMessage(
            await messageSigner.createSignedMessage(
                {
                    messageId: new MessageID(stream.id, 0, Date.now(), 0, PUBLISHER_ID, 'msgChainId'),
                    messageType: StreamMessageType.MESSAGE,
                    content: MOCK_CONTENT,
                    contentType: ContentType.JSON,
                    encryptionType: EncryptionType.NONE
                },
                SignatureType.SECP256K1
            )
        )
        await expect(() =>
            client.waitForStorage(msg, {
                interval: 50,
                timeout: 100,
                count: 1,
                messageMatchFn: () => {
                    return true
                }
            })
        ).rejects.toThrow('timed out')
    })

    it('no storage assigned', async () => {
        const msg = convertStreamMessageToMessage(
            await messageSigner.createSignedMessage(
                {
                    messageId: new MessageID(stream.id, 0, Date.now(), 0, PUBLISHER_ID, 'msgChainId'),
                    messageType: StreamMessageType.MESSAGE,
                    content: MOCK_CONTENT,
                    contentType: ContentType.JSON,
                    encryptionType: EncryptionType.NONE
                },
                SignatureType.SECP256K1
            )
        )
        await expect(() =>
            client.waitForStorage(msg, {
                messageMatchFn: () => {
                    return true
                }
            })
        ).rejects.toThrowStreamrClientError(
            new StreamrClientError(`no storage assigned: ${stream.id}`, 'NO_STORAGE_NODES')
        )
    })
})
