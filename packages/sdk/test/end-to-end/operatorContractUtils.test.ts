import { config as CHAIN_CONFIG } from '@streamr/config'
import { createTestWallet, describeOnlyInNodeJs } from '@streamr/test-utils'
import { Logger, TheGraphClient, until } from '@streamr/utils'
import { parseEther } from 'ethers'
import { _operatorContractUtils } from '../../src'
import { createTestClient, createTestStream } from '../test-utils/utils'

const createTheGraphClient = (): TheGraphClient => {
    return new TheGraphClient({
        serverUrl: CHAIN_CONFIG.dev2.theGraphUrl,
        fetch,
        logger: new Logger('operatorContractUtils.test')
    })
}

// It will take some time until The Graph indexes the entity: here we re-query the entity until it appears in the index
const queryTheGraphUntilSuccess = async (query: string): Promise<any> => {
    const TIMEOUT = 4000
    const client = createTheGraphClient()
    let result
    await until(async () => {
        const response = await client.queryEntity<any>({ query })
        result = Object.values(response)[0]
        return (result !== null)
    }, TIMEOUT)
    return result
}

describeOnlyInNodeJs('operatorContractUtils', () => {
    it('deploySponsorshipContract', async () => {
        const stream = await createTestStream(createTestClient((await createTestWallet({ gas: true })).privateKey), module)
        const deployer = await createTestWallet({ gas: true, tokens: true })
        const sponsorship = await _operatorContractUtils.deploySponsorshipContract({
            streamId: stream.id,
            deployer,
            metadata: JSON.stringify({ foo: 'bar' }),
            earningsPerSecond: 123n,
            minOperatorCount: 1,
            maxOperatorCount: 2,
            minStakeDuration: 456,
            environmentId: 'dev2',
            sponsorAmount: 10000n
        })
        const contractAddress = await sponsorship.getAddress()
        const result = await queryTheGraphUntilSuccess(`{
            sponsorship(id: "${contractAddress.toLowerCase()}") {
                stream {
                    id
                }
                totalPayoutWeiPerSec
                metadata
                minOperators
                maxOperators
                minimumStakingPeriodSeconds
                sponsoringEvents {
                    amount
                    sponsor
                }
            }
        }`)
        expect(result).toEqual({
            stream: {
                id: stream.id
            },
            totalPayoutWeiPerSec: '123',
            metadata: '{"foo":"bar"}',
            minOperators: 1,
            maxOperators: 2,
            minimumStakingPeriodSeconds: '456',
            sponsoringEvents: [{
                amount: '10000',
                sponsor: (await deployer.getAddress()).toLowerCase()
            }]
        })
    })

    it('stake and unstake', async () => {
        const operator = await createTestWallet({ gas: true, tokens: true })
        const operatorContract = await _operatorContractUtils.deployOperatorContract({
            deployer: operator,
            environmentId: 'dev2'
        })
        const stream = await createTestStream(createTestClient((await createTestWallet({ gas: true })).privateKey), module)
        const sponsorshipContract = await _operatorContractUtils.deploySponsorshipContract({
            streamId: stream.id,
            deployer: operator,
            earningsPerSecond: 123n,
            environmentId: 'dev2'
        })
        await _operatorContractUtils.delegate(operator, await operatorContract.getAddress(), parseEther('10000'))

        await _operatorContractUtils.stake(
            operator, 
            await operatorContract.getAddress(), 
            await sponsorshipContract.getAddress(),
            parseEther('8000')
        )
        expect(await sponsorshipContract.stakedWei(operatorContract.getAddress())).toBe(parseEther('8000'))

        await _operatorContractUtils.unstake(
            operator,
            await operatorContract.getAddress(),
            await sponsorshipContract.getAddress(),
            parseEther('1000')
        )
        expect(await sponsorshipContract.stakedWei(operatorContract.getAddress())).toBe(parseEther('7000'))
    })
})
