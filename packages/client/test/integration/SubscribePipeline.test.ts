import 'reflect-metadata'
import { GroupKey } from './../../src/encryption/GroupKey'
import { StreamMessage, StreamPartID } from 'streamr-client-protocol'
import { Wallet } from '@ethersproject/wallet'
import { StreamPermission } from './../../src/permission'
import { createMockMessage } from './../test-utils/utils'
import { MessageStream } from './../../src/subscribe/MessageStream'
import { fastWallet } from "streamr-test-utils"
import { SubscribePipeline } from "../../src/subscribe/SubscribePipeline"
import { FakeEnvironment } from "../test-utils/fake/FakeEnvironment"
import { mockContext } from '../test-utils/utils'
import { collect } from '../../src/utils/GeneratorUtils'
import { StreamrClient } from '../../src/StreamrClient'
import { DecryptError } from '../../src/encryption/EncryptionUtil'
import { sign } from '../../src/utils/signingUtils'

const CONTENT = {
    foo: 'bar'
}

describe('SubscribePipeline', () => {

    let pipeline: MessageStream
    let input: MessageStream
    let streamPartId: StreamPartID
    let publisher: Wallet
    let subscriber: StreamrClient
    let environment: FakeEnvironment

    beforeEach(async () => {
        environment = new FakeEnvironment()
        subscriber = environment.createClient({
            decryption: {
                keyRequestTimeout: 50
            }
        })
        const stream = await subscriber.createStream('/path')
        streamPartId = stream.getStreamParts()[0]
        publisher = fastWallet()
        await stream.grantPermissions({
            user: publisher.address,
            permissions: [StreamPermission.PUBLISH]
        })
        const context = mockContext()
        input = new MessageStream(context)
        pipeline = SubscribePipeline(
            input,
            streamPartId,
            context,
            // @ts-expect-error private
            subscriber.container
        )
    })

    it('happy path', async () => {
        await input.push(await createMockMessage({
            publisher,
            streamPartId,
            content: CONTENT
        }))
        input.endWrite()
        const output = await collect(pipeline)
        expect(output).toHaveLength(1)
        expect(output[0].getParsedContent()).toEqual(CONTENT)
    })

    it('error: invalid signature', async () => {
        const msg = await createMockMessage({
            publisher,
            streamPartId,
            content: CONTENT
        })
        msg.signature = 'invalid-signature'
        await input.push(msg)
        input.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error.message).toContain('Signature validation failed')
        expect(output).toEqual([])
    })

    it('error: invalid content', async () => {
        const msg = await createMockMessage({
            publisher,
            streamPartId
        })
        msg.serializedContent = '{ invalid-json'
        msg.signature = sign(msg.getPayloadToSign(StreamMessage.SIGNATURE_TYPES.ETH), publisher.privateKey)
        await input.push(msg)
        input.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error.message).toContain('Invalid JSON')
        expect(output).toEqual([])
    })

    it('error: no encryption key available', async () => {
        const encryptionKey = GroupKey.generate()
        await input.push(await createMockMessage({
            publisher,
            streamPartId,
            content: CONTENT,
            encryptionKey
        }))
        input.endWrite()
        const onError = jest.fn()
        pipeline.onError.listen(onError)
        const output = await collect(pipeline)
        expect(onError).toBeCalledTimes(1)
        const error = onError.mock.calls[0][0]
        expect(error).toBeInstanceOf(DecryptError)
        expect(output).toEqual([])
    })
})
