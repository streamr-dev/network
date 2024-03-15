import { Wallet } from 'ethers'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition, areEqualBinaries, toEthereumAddress, EthereumAddress } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream, createTestClient } from '../test-utils/utils'
import { StreamPermission } from '../../src/permission'
import { deployMockERC1271Contract } from '../test-utils/deployMockERC1271Contract'
import { StreamID } from '@streamr/protocol'
import { MessageMetadata } from '../../src'

const PAYLOAD = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
const TIMEOUT = 30 * 1000

describe('ERC-1271: publish and subscribe', () => {
    let publisherWallet: Wallet
    let subscriberWallet: Wallet
    let erc1271ContractAddress: EthereumAddress

    beforeAll(async () => {
        subscriberWallet = fastWallet()
        publisherWallet = new Wallet(await fetchPrivateKeyWithGas())
        erc1271ContractAddress = await deployMockERC1271Contract([toEthereumAddress(publisherWallet.address)])
    }, TIMEOUT)

    async function createStream(publicSubscribePermission: boolean): Promise<StreamID> {
        const creator = createTestClient(await fetchPrivateKeyWithGas())
        const stream = await createTestStream(creator, module)
        await stream.grantPermissions({
            permissions: [StreamPermission.PUBLISH],
            user: erc1271ContractAddress
        })
        await creator.setPermissions({
            streamId: stream.id,
            assignments: publicSubscribePermission ? [
                { permissions: [StreamPermission.SUBSCRIBE], public: true }
            ] : [
                { permissions: [StreamPermission.SUBSCRIBE], user: subscriberWallet.address }
            ]
        })
        await creator.destroy()
        return stream.id
    }

    describe('public stream', () => {
        let publisher: StreamrClient
        let subscriber: StreamrClient
        let streamId: StreamID

        beforeEach(async () => {
            subscriber = createTestClient(subscriberWallet.privateKey)
            publisher = createTestClient(publisherWallet.privateKey)
            streamId = await createStream(true)
        }, TIMEOUT)

        afterEach(async () => {
            await subscriber.destroy()
            await publisher.destroy()
        })

        it('ERC-1271 signed published message is received by subscriber', async () => {
            const messages: unknown[] = []
            const metadatas: MessageMetadata[] = []
            await subscriber.subscribe(streamId, (msg: any, metadata) => {
                messages.push(msg)
                metadatas.push(metadata)
            })
            await publisher.publish(streamId, PAYLOAD, { eip1271Contract: erc1271ContractAddress })
            await waitForCondition(() => messages.length > 0, TIMEOUT)
            expect(metadatas[0].signatureType).toEqual('EIP_1271')
            expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toEqual(true)
        }, TIMEOUT)
    })

    describe('private stream', () => {
        let publisher: StreamrClient
        let subscriber: StreamrClient
        let streamId: StreamID

        beforeEach(async () => {
            subscriber = createTestClient(subscriberWallet.privateKey)
            publisher = createTestClient(publisherWallet.privateKey)
            streamId = await createStream(false)
        }, TIMEOUT)

        afterEach(async () => {
            await subscriber.destroy()
            await publisher.destroy()
        })

        it('ERC-1271 signed published message is received by subscriber', async () => {
            const messages: unknown[] = []
            const metadatas: MessageMetadata[] = []
            await subscriber.subscribe(streamId, (msg: any, metadata) => {
                messages.push(msg)
                metadatas.push(metadata)
            })
            await publisher.publish(streamId, PAYLOAD, { eip1271Contract: erc1271ContractAddress })
            await waitForCondition(() => messages.length > 0, TIMEOUT)
            expect(metadatas[0].signatureType).toEqual('EIP_1271')
            expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toEqual(true)
        }, TIMEOUT)
    })
})
