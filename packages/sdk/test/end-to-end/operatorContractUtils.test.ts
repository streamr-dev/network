import { createTestWallet } from '@streamr/test-utils'
import { _operatorContractUtils } from '../../src'
import { createTestClient, createTestStream } from '../test-utils/utils'
import { Logger, TheGraphClient, until } from '@streamr/utils'
import { config as CHAIN_CONFIG } from '@streamr/config'

const createTheGraphClient = (): TheGraphClient => {
    return new TheGraphClient({
        serverUrl: CHAIN_CONFIG.dev2.theGraphUrl,
        fetch,
        logger: new Logger(module)
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

describe('operatorContractUtils', () => {
    it('deploySponsorshipContract', async () => {
        const stream = await createTestStream(createTestClient((await createTestWallet({ gas: true })).privateKey), module)
        const sponsorship = await _operatorContractUtils.deploySponsorshipContract({
            streamId: stream.id,
            deployer: await createTestWallet({ gas: true }),
            metadata: JSON.stringify({ foo: 'bar' }),
            earningsPerSecond: 123n,
            minOperatorCount: 1,
            maxOperatorCount: 2,
            minStakeDuration: 456,
            environmentId: 'dev2'
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
            minimumStakingPeriodSeconds: '456'
        })
    })
})
