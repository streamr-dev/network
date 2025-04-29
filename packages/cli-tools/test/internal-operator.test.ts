import { _operatorContractUtils } from '@streamr/sdk'
import { createTestPrivateKey, createTestWallet } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { parseEther } from 'ethers'
import { createTestClient, runCommand } from './utils'

const DELEGATION_AMOUNT = '20000'
const STAKE_AMOUNT = '10000'
const SELF_DELEGATION_AMOUNT = '100000'
const MINIMUM_DELEGATION_SECONDS = 1  // the config value defined in StreamrEnvDeployer in network-contracts repo

describe('operator', () => {

    it('happy path', async () => {
        const client = createTestClient(await createTestPrivateKey({ gas: true }))
        const stream = await client.createStream('/test')
        const sponsorshipContract = await _operatorContractUtils.deploySponsorshipContract({ 
            streamId: stream.id,
            deployer: await createTestWallet({ gas: true })
        })
        const sponsorshipAddress: string = await sponsorshipContract.getAddress()
        const operator = await createTestWallet({ gas: true, tokens: true })
        const operatorContract = await _operatorContractUtils.deployOperatorContract({
            deployer: operator
        })
        await _operatorContractUtils.delegate(operator, await operatorContract.getAddress(), parseEther(SELF_DELEGATION_AMOUNT))
        const delegator = await createTestWallet({ gas: true, tokens: true })
        const operatorContractAddress: string = await operatorContract.getAddress()

        // delegate
        await runCommand(`internal operator-delegate ${operatorContractAddress} ${DELEGATION_AMOUNT}`, {
            privateKey: delegator.privateKey
        })
        expect(await operatorContract.balanceInData(await delegator.getAddress())).toEqual(parseEther(DELEGATION_AMOUNT))

        // stake
        await runCommand(`internal operator-stake ${operatorContractAddress} ${sponsorshipAddress} ${STAKE_AMOUNT}`, {
            privateKey: operator.privateKey
        })
        expect(await operatorContract.totalStakedIntoSponsorshipsWei()).toEqual(parseEther(STAKE_AMOUNT))

        // unstake
        await runCommand(`internal operator-unstake ${operatorContractAddress} ${sponsorshipAddress}`, {
            privateKey: operator.privateKey
        })
        expect(await operatorContract.totalStakedIntoSponsorshipsWei()).toEqual(0n)

        // undelegate
        await wait(MINIMUM_DELEGATION_SECONDS)
        await runCommand(`internal operator-undelegate ${operatorContractAddress} ${DELEGATION_AMOUNT}`, {
            privateKey: delegator.privateKey
        })
        expect(await operatorContract.balanceInData(await delegator.getAddress())).toEqual(0n)

        await client.destroy()
    }, 30 * 1000)
})
