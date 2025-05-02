import { createTestPrivateKey, createTestWallet } from '@streamr/test-utils'
import { parseEther } from 'ethers'
import { createTestClient, deployTestSponsorshipContract, runCommand } from './utils'

const SPONSOR_AMOUNT = '12345'

describe('sponsorship-sponsor', () => {

    it('happy path', async () => {
        const client = createTestClient(await createTestPrivateKey({ gas: true }))
        const stream = await client.createStream('/test')
        const sponsorshipContract = await deployTestSponsorshipContract({ 
            streamId: stream.id,
            deployer: await createTestWallet({ gas: true })
        })

        const sponsorer = await createTestWallet({ gas: true, tokens: true })
        const sponsorshipAddress: string = await sponsorshipContract.getAddress()
        await runCommand(`internal sponsorship-sponsor ${sponsorshipAddress} ${SPONSOR_AMOUNT}`, {
            privateKey: sponsorer.privateKey
        })

        const remainingWei = await sponsorshipContract.connect(sponsorer).remainingWei()
        expect(remainingWei).toEqual(parseEther(SPONSOR_AMOUNT))
        await client.destroy()
    })
})
