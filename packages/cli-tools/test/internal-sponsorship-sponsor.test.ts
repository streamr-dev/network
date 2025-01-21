import { _operatorContractUtils } from '@streamr/sdk'
import { createTestWallet, fetchPrivateKeyWithGas } from '@streamr/test-utils'
import { parseEther } from 'ethers'
import { createTestClient, runCommand } from './utils'

const SPONSOR_AMOUNT = '12345'

describe('sponsorship-sponsor', () => {

    it('happy path', async () => {
        const client = createTestClient(await fetchPrivateKeyWithGas())
        const stream = await client.createStream('/test')
        const sponsorshipContract = await _operatorContractUtils.deploySponsorshipContract({ 
            streamId: stream.id,
            deployer: await createTestWallet({ gas: true })
        })

        const sponsorer = await createTestWallet({ gas: true, tokens: true })
        const sponsorshipAddress: string = await sponsorshipContract.getAddress()
        await runCommand(`internal sponsorship-sponsor ${sponsorshipAddress} ${SPONSOR_AMOUNT}`, {
            privateKey: sponsorer.privateKey
        })

        const remainingWei = await sponsorshipContract.connect(sponsorer, _operatorContractUtils.getProvider()).remainingWei()
        expect(remainingWei).toEqual(parseEther(SPONSOR_AMOUNT))
        await client.destroy()
    })
})
