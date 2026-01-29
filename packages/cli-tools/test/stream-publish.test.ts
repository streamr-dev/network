import {
    ContentType,
    convertStreamMessageToBytes,
    EncryptionType,
    EthereumKeyPairIdentity,
    MessageID,
    MessageSigner,
    SigningService,
    SignatureType,
    StreamMessageType,
    StreamPermission,
    StreamrClient,
    DestroySignal
} from '@streamr/sdk'
import { createTestPrivateKey } from '@streamr/test-utils'
import { binaryToHex, keyToArrayIndex, StreamID, toLengthPrefixedFrame, toUserId, UserID } from '@streamr/utils'
import { Wallet } from 'ethers'
import range from 'lodash/range'
import { createTestClient, nextValue, runCommand } from './utils'

const PARTITION_COUNT = 10

describe('stream-publish', () => {

    let streamId: StreamID
    let publisherPrivateKey: string
    let subscriberPrivateKey: string
    let streamCreatorPrivateKey: string
    let signingService: SigningService

    beforeAll(() => {
        signingService = new SigningService(new DestroySignal())
    })

    afterAll(() => {
        signingService.destroy()
    })

    function createSubscriber(): StreamrClient {
        return createTestClient(subscriberPrivateKey)
    }

    async function grantPublishPermission(publisherId: UserID) {
        const client = createTestClient(streamCreatorPrivateKey)
        await client.grantPermissions(streamId, {
            userId: publisherId,
            permissions: [StreamPermission.PUBLISH]
        })
        await client.destroy()
    }

    async function createTestMessage(streamId: StreamID, partition: number, privateKey: string, content: Uint8Array, timestamp: number) {
        const messageSigner = new MessageSigner(EthereumKeyPairIdentity.fromPrivateKey(privateKey), signingService)
        return await messageSigner.createSignedMessage({
            messageId: new MessageID(streamId, partition, timestamp, 0, toUserId(new Wallet(privateKey).address), 'mock-msgChainId'),
            content,
            contentType: ContentType.BINARY,
            encryptionType: EncryptionType.NONE,
            messageType: StreamMessageType.MESSAGE
        }, SignatureType.ECDSA_SECP256K1_EVM)
    }

    beforeEach(async () => {
        publisherPrivateKey = await createTestPrivateKey({ gas: true })
        subscriberPrivateKey = await createTestPrivateKey({ gas: true })
        streamCreatorPrivateKey = await createTestPrivateKey({ gas: true })
        const client = createTestClient(streamCreatorPrivateKey)
        const stream = await client.createStream({ id: `/${Date.now()}`, partitions: PARTITION_COUNT })
        await stream.grantPermissions({
            userId: new Wallet(publisherPrivateKey).address,
            permissions: [StreamPermission.PUBLISH]
        }, {
            userId: new Wallet(subscriberPrivateKey).address,
            permissions: [StreamPermission.SUBSCRIBE]
        })
        streamId = stream.id
        await client.destroy()
    })

    function publishJsonViaCliCommand(inputLine: string, additionalArgs: string[] = []) {
        const args = [streamId, ...additionalArgs]
        setImmediate(async () => {
            await runCommand(`stream publish ${args.join(' ')}`, {
                inputLines: [inputLine],
                privateKey: publisherPrivateKey
            })
        })
    }

    function publishBinaryViaCliCommand(payload: Uint8Array, additionalArgs: string[] = [], privateKey = publisherPrivateKey) {
        const args = [streamId, ...additionalArgs, '--binary']
        setImmediate(async () => {
            await runCommand(`stream publish ${args.join(' ')}`, {
                inputBinary: toLengthPrefixedFrame(payload),
                privateKey
            })
        })
    }
    it('happy path', async () => {
        const subscriber = createSubscriber()
        const subscriptions = await Promise.all(range(PARTITION_COUNT).map((partition) => subscriber.subscribe({ id: streamId, partition })))
        publishJsonViaCliCommand(JSON.stringify({ foo: 123 }))
        const receivedMessage = await Promise.race(subscriptions.map((s) => nextValue(s[Symbol.asyncIterator]())))
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('hex content', async () => {
        const PARTITION = 5
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishJsonViaCliCommand(binaryToHex(new Uint8Array([4, 5, 6]), false), [`--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqualBinary(new Uint8Array([4, 5, 6]))
        await subscriber.destroy()
    })

    it('explicit partition', async () => {
        const PARTITION = 5
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishJsonViaCliCommand(JSON.stringify({ foo: 123 }), [`--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('partition key field', async () => {
        const partition = keyToArrayIndex(PARTITION_COUNT, 123)
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition })
        publishJsonViaCliCommand(JSON.stringify({ foo: 123 }), ['--partition-key-field foo'])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        await subscriber.destroy()
    })

    it('with metadata', async () => {
        const PARTITION = 5
        const PAYLOAD = { content: { foo: 123 }, metadata: { msgChainId: 'testMsgChainId' } }
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishJsonViaCliCommand(JSON.stringify(PAYLOAD), ['--with-metadata', `--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual({ foo: 123 })
        expect(receivedMessage!.msgChainId).toEqual('testMsgChainId')
        await subscriber.destroy()
    })

    it('with metadata, hex content', async () => {
        const PARTITION = 5
        const PAYLOAD = { content: binaryToHex(new Uint8Array([4, 5, 6]), false), metadata: { msgChainId: 'testMsgChainId' } }
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishJsonViaCliCommand(JSON.stringify(PAYLOAD), ['--with-metadata', `--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqual(new Uint8Array([4, 5, 6]))
        expect(receivedMessage!.msgChainId).toEqual('testMsgChainId')
    })

    it('binary', async () => {
        const PARTITION = 5
        const CONTENT = new Uint8Array([1, 2, 3])
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        publishBinaryViaCliCommand(CONTENT, [`--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqualBinary(CONTENT)
        await subscriber.destroy()
    })

    it('binary with metadata', async () => {
        const PARTITION = 5
        const CONTENT = new Uint8Array([4, 5, 6])
        const TIMESTAMP = 123456789
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        const inputMessage = await createTestMessage(streamId, PARTITION, publisherPrivateKey, CONTENT, TIMESTAMP)
        publishBinaryViaCliCommand(convertStreamMessageToBytes(inputMessage), ['--with-metadata', `--partition ${PARTITION}`])
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqualBinary(CONTENT)
        expect(receivedMessage!.timestamp).toBe(TIMESTAMP)
        await subscriber.destroy()
    })

    it('binary with metadata, send as raw', async () => {
        const PARTITION = 5
        const CONTENT = new Uint8Array([7, 8, 9])
        const TIMESTAMP = 123456789
        const subscriber = createSubscriber()
        const subscription = await subscriber.subscribe({ id: streamId, partition: PARTITION })
        const inputMessagePrivateKey = await createTestPrivateKey()
        const inputMessagePublisherId = toUserId(new Wallet(inputMessagePrivateKey).address)
        const inputMessage = await createTestMessage(streamId, PARTITION, inputMessagePrivateKey, CONTENT, TIMESTAMP)
        await grantPublishPermission(inputMessagePublisherId)
        publishBinaryViaCliCommand(
            convertStreamMessageToBytes(inputMessage),
            ['--with-metadata', '--raw', `--partition ${PARTITION}`], 
            inputMessagePrivateKey
        )
        const receivedMessage = await nextValue(subscription[Symbol.asyncIterator]())
        expect(receivedMessage!.content).toEqualBinary(CONTENT)
        expect(receivedMessage!.timestamp).toBe(TIMESTAMP)
        expect(receivedMessage!.publisherId).toBe(inputMessagePublisherId)
        await subscriber.destroy()
    })
})
