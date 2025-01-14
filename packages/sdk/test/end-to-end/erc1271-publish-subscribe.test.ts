import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { EthereumAddress, StreamID, areEqualBinaries, toEthereumAddress, until } from '@streamr/utils'
import { Wallet } from 'ethers'
import { MessageMetadata } from '../../src'
import { StreamrClient } from '../../src/StreamrClient'
import { StreamPermission } from '../../src/permission'
import { deployTestERC1271Contract } from '../test-utils/deployTestERC1271Contract'
import { createTestClient, createTestStream } from '../test-utils/utils'

const PAYLOAD = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const TIMEOUT = 30 * 1000

describe('ERC-1271: publish', () => {
    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let erc1271ContractAddress: EthereumAddress

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherWallet = new Wallet(await fetchPrivateKeyWithGas())
        erc1271ContractAddress = await deployTestERC1271Contract([toEthereumAddress(publisherWallet.address)])
    }, TIMEOUT)

    async function createStream(publicSubscribePermission: boolean): Promise<StreamID> {
        const creator = createTestClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(creator, module)
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            userId: erc1271ContractAddress
        })
        await creator.setPermissions({
            streamId: stream.id,
            assignments: publicSubscribePermission
                ? [{ permissions: [StreamPermission.SUBSCRIBE], public: true }]
                : [{ permissions: [StreamPermission.SUBSCRIBE], userId: subscriberWallet.address }]
        })
        await creator.destroy()
        return stream.id
    }

    describe.each(['public', 'private'])('%s stream', (publicOrPrivate) => {
        let publisher: StreamrClient
        let subscriber: StreamrClient
        let streamId: StreamID

        beforeEach(async () => {
            subscriber = createTestClient(subscriberWallet.privateKey)
            publisher = createTestClient(publisherWallet.privateKey)
            streamId = await createStream(publicOrPrivate === 'public')
        }, TIMEOUT)

        afterEach(async () => {
            await subscriber.destroy()
            await publisher.destroy()
        })

        it(
            'ERC-1271 signed published message is received by subscriber',
            async () => {
                const messages: unknown[] = []
                const metadatas: MessageMetadata[] = []
                await subscriber.subscribe(streamId, (msg: any, metadata) => {
                    messages.push(msg)
                    metadatas.push(metadata)
                })
                await publisher.publish(streamId, PAYLOAD, { erc1271Contract: erc1271ContractAddress })
                await until(() => messages.length > 0, TIMEOUT)
                expect(metadatas[0].signatureType).toEqual('ERC_1271')
                if (publicOrPrivate === 'public') {
                    expect(metadatas[0].groupKeyId).toEqual(undefined)
                } else {
                    expect(metadatas[0].groupKeyId).toBeString()
                }
                expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toBe(true)
            },
            TIMEOUT
        )
    })
})

describe('ERC-1271: subscribe', () => {
    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let erc1271ContractAddress: EthereumAddress

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherWallet = new Wallet(await fetchPrivateKeyWithGas())
        erc1271ContractAddress = await deployTestERC1271Contract([toEthereumAddress(subscriberWallet.address)])
    }, TIMEOUT)

    async function createStream(): Promise<StreamID> {
        const creator = createTestClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(creator, module)
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            userId: publisherWallet.address
        })
        await stream.grantPermissions({
            permissions: [StreamPermission.SUBSCRIBE],
            userId: erc1271ContractAddress
        })
        await creator.destroy()
        return stream.id
    }

    let publisher: StreamrClient
    let subscriber: StreamrClient
    let streamId: StreamID

    beforeEach(async () => {
        subscriber = createTestClient(subscriberWallet.privateKey)
        publisher = createTestClient(publisherWallet.privateKey)
        streamId = await createStream()
    }, TIMEOUT)

    afterEach(async () => {
        await subscriber.destroy()
        await publisher.destroy()
    })

    it(
        'subscriber configured with ERC-1271 contract can receive messages',
        async () => {
            const messages: unknown[] = []
            const metadatas: MessageMetadata[] = []
            await subscriber.subscribe(
                {
                    streamId,
                    erc1271Contract: erc1271ContractAddress
                },
                (msg: any, metadata) => {
                    messages.push(msg)
                    metadatas.push(metadata)
                }
            )
            await publisher.publish(streamId, PAYLOAD)
            await until(() => messages.length > 0, TIMEOUT)
            expect(metadatas[0].signatureType).toEqual('SECP256K1')
            expect(metadatas[0].groupKeyId).toBeString()
            expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toBe(true)
        },
        TIMEOUT
    )
})

describe('ERC-1271: publish and subscribe', () => {
    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let erc1271SubscriberContractAddress: EthereumAddress
    let erc1271PublisherContractAddress: EthereumAddress

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherWallet = new Wallet(await fetchPrivateKeyWithGas())
        erc1271SubscriberContractAddress = await deployTestERC1271Contract([
            toEthereumAddress(subscriberWallet.address)
        ])
        erc1271PublisherContractAddress = await deployTestERC1271Contract([toEthereumAddress(publisherWallet.address)])
    }, TIMEOUT)

    async function createStream(): Promise<StreamID> {
        const creator = createTestClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(creator, module)
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            userId: erc1271PublisherContractAddress
        })
        await stream.grantPermissions({
            permissions: [StreamPermission.SUBSCRIBE],
            userId: erc1271SubscriberContractAddress
        })
        await creator.destroy()
        return stream.id
    }

    let publisher: StreamrClient
    let subscriber: StreamrClient
    let streamId: StreamID

    beforeEach(async () => {
        subscriber = createTestClient(subscriberWallet.privateKey)
        publisher = createTestClient(publisherWallet.privateKey)
        streamId = await createStream()
    }, TIMEOUT)

    afterEach(async () => {
        await subscriber.destroy()
        await publisher.destroy()
    })

    it(
        'subscriber configured with ERC-1271 contract can receive ERC-1271 signed messages',
        async () => {
            const messages: unknown[] = []
            const metadatas: MessageMetadata[] = []
            await subscriber.subscribe(
                {
                    streamId,
                    erc1271Contract: erc1271SubscriberContractAddress
                },
                (msg: any, metadata) => {
                    messages.push(msg)
                    metadatas.push(metadata)
                }
            )
            await publisher.publish(streamId, PAYLOAD, { erc1271Contract: erc1271PublisherContractAddress })
            await until(() => messages.length > 0, TIMEOUT)
            expect(metadatas[0].signatureType).toEqual('ERC_1271')
            expect(metadatas[0].groupKeyId).toBeString()
            expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toBe(true)
        },
        TIMEOUT
    )
})
