import { Wallet } from 'ethers'
import { fastWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { waitForCondition, areEqualBinaries, toEthereumAddress, EthereumAddress } from '@streamr/utils'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestStream, createTestClient } from '../test-utils/utils'
import { StreamPermission } from '../../src/permission'
import { deployMockERC1271Contract } from '../test-utils/deployMockERC1271Contract'
import { StreamID } from '@streamr/protocol'

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
            await subscriber.subscribe(streamId, (msg: any) => {
                messages.push(msg)
            })
            await publisher.publish(streamId, PAYLOAD, { eip1271Contract: erc1271ContractAddress })
            await waitForCondition(() => messages.length > 0, TIMEOUT)
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
            await subscriber.subscribe(streamId, (msg: any) => {
                messages.push(msg)
            })
            await publisher.publish(streamId, PAYLOAD, { eip1271Contract: erc1271ContractAddress })
            await waitForCondition(() => messages.length > 0, TIMEOUT)
            expect(areEqualBinaries(messages[0] as Uint8Array, PAYLOAD)).toEqual(true)
        }, TIMEOUT)
    })
})
