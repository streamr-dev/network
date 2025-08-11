import { _operatorContractUtils } from '@streamr/sdk'
import { createTestPrivateKey, createTestWallet } from '@streamr/test-utils'
import { wait } from '@streamr/utils'
import { parseEther } from 'ethers'
import { createTestClient, deployTestOperatorContract, deployTestSponsorshipContract, runCommand } from './utils'

const DELEGATION_AMOUNT = '20000'
const STAKE_AMOUNT = '10000'
const UNSTAKE_AMOUNT = '3000'
const SELF_DELEGATION_AMOUNT = '100000'
const MINIMUM_DELEGATION_SECONDS = 1  // the config value defined in StreamrEnvDeployer in network-contracts repo
const EARNINGS_PER_SECOND = parseEther('1')

describe('operator', () => {

    it('happy path', async () => {
        const client = createTestClient(await createTestPrivateKey({ gas: true }))
        const stream = await client.createStream('/test')
        const sponsorshipContract = await deployTestSponsorshipContract({ 
            streamId: stream.id,
            deployer: await createTestWallet({ gas: true }),
            earningsPerSecond: EARNINGS_PER_SECOND
        })
        const sponsorshipAddress: string = await sponsorshipContract.getAddress()
        const operator = await createTestWallet({ gas: true, tokens: true })
        const operatorContract = await deployTestOperatorContract({
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
        expect(await sponsorshipContract.stakedWei(operatorContractAddress)).toEqual(parseEther(STAKE_AMOUNT))

        // unstake
        await runCommand(`internal operator-unstake ${operatorContractAddress} ${sponsorshipAddress} ${UNSTAKE_AMOUNT}`, {
            privateKey: operator.privateKey
        })
        expect(await sponsorshipContract.stakedWei(operatorContractAddress)).toEqual(parseEther(STAKE_AMOUNT) - parseEther(UNSTAKE_AMOUNT))

        // undelegate
        await wait(MINIMUM_DELEGATION_SECONDS)
        await runCommand(`internal operator-undelegate ${operatorContractAddress} ${DELEGATION_AMOUNT}`, {
            privateKey: delegator.privateKey
        })
        expect(await operatorContract.balanceInData(await delegator.getAddress())).toEqual(0n)

        // grant controller role
        const controller = await createTestWallet()
        await runCommand(`internal operator-grant-controller-role ${operatorContractAddress} ${controller.address}`, {
            privateKey: operator.privateKey
        })
        expect(await operatorContract.hasRole(await operatorContract.CONTROLLER_ROLE(), controller.address)).toBeTrue()

        await client.destroy()
    }, 30 * 1000)
})
