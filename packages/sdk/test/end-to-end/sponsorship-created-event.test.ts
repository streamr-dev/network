import { createTestWallet } from '@streamr/test-utils'
import { Wallet, parseEther } from 'ethers'
import { StreamrClient } from '../../src/StreamrClient'
import { createTestClient, createTestStream, deployTestSponsorshipContract } from '../test-utils/utils'
import { Stream } from '../../src'
import { toEthereumAddress, waitForEvent } from '@streamr/utils'
import { SponsorshipCreatedEvent } from '../../src/contracts/SponsorshipFactory'

const TEST_TIMEOUT = 15 * 1000

describe('sponsorship created event', () => {
    let listenerWallet: Wallet
    let creatorWallet: Wallet
    let listenerClient: StreamrClient
    let creatorClient: StreamrClient
    let testStream: Stream

    beforeEach(async () => {
        listenerWallet = await createTestWallet({ gas: true })
        creatorWallet = await createTestWallet({ gas: true })
        listenerClient = createTestClient(listenerWallet.privateKey)
        creatorClient = createTestClient(creatorWallet.privateKey)
        testStream = await createTestStream(creatorClient, module)
    }, TEST_TIMEOUT)

    afterEach(async () => {
        await Promise.allSettled([
            listenerClient.destroy(),
            creatorClient.destroy()
        ])
    })

    it('sponsorship creation event is triggered when a new sponsorship is created', async () => {
        const listenerEvent = waitForEvent(listenerClient, 'sponsorshipCreated', TEST_TIMEOUT - 500)
        const sponsorship = await deployTestSponsorshipContract({
            streamId: testStream.id,
            deployer: creatorWallet as any,
            earningsPerSecond: parseEther('1')
        })
        const expectedSponsorshipAddress = toEthereumAddress(await sponsorship.getAddress())

        const sponsorshipCreatedEvent: SponsorshipCreatedEvent[] = await listenerEvent

        expect(sponsorshipCreatedEvent.length).toEqual(1)
        expect(sponsorshipCreatedEvent[0].sponsorshipContractAddress).toEqual(expectedSponsorshipAddress)
        expect(sponsorshipCreatedEvent[0].streamId).toBe(testStream.id)
        expect(sponsorshipCreatedEvent[0].blockNumber).toBeNumber()
    }, TEST_TIMEOUT)
})
