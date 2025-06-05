import { createTestPrivateKey, createTestWallet } from '@streamr/test-utils'
import { until } from '@streamr/utils'
import { parseEther } from 'ethers'
import { createTestClient, runCommand } from './utils'

interface QueryResultItem {
    sponsorships: [{
        totalPayoutWeiPerSec: string
        minOperators: number
        maxOperators: number
        minimumStakingPeriodSeconds: string
    }]
}

const EARNINGS_PER_SECOND = 123
const MIN_OPERATOR_COUNT = 10
const MAX_OPERATOR_COUNT = 20
const MIN_STAKE_DURATION = 456

describe('sponsorship-create', () => {

    it('happy path', async () => {
        const client = createTestClient(await createTestPrivateKey({ gas: true }))
        const stream = await client.createStream('/test')

        const sponsorer = await createTestWallet({ gas: true, tokens: true })
        // eslint-disable-next-line max-len
        const command = `internal sponsorship-create ${stream.id} --earnings-per-second ${EARNINGS_PER_SECOND} --min-operator-count ${MIN_OPERATOR_COUNT} --max-operator-count ${MAX_OPERATOR_COUNT} --min-stake-duration ${MIN_STAKE_DURATION}`
        await runCommand(command, {
            privateKey: sponsorer.privateKey
        })

        // wait for The Graph to index it
        let queryResult
        await until(async () => {
            queryResult = await client.getTheGraphClient().queryEntity<QueryResultItem>({ 
                query: `
                    {
                        sponsorships (
                            where: { 
                                stream_: { 
                                    id: "${stream.id}"
                                }
                            }
                        ) {
                            totalPayoutWeiPerSec
                            minOperators
                            maxOperators
                            minimumStakingPeriodSeconds
                        }
                    }
                `
            })
            return queryResult.sponsorships.length > 0
        })

        expect(queryResult!.sponsorships[0]).toEqual({ 
            totalPayoutWeiPerSec: parseEther(String(EARNINGS_PER_SECOND)).toString(),
            minOperators: MIN_OPERATOR_COUNT,
            maxOperators: MAX_OPERATOR_COUNT,
            minimumStakingPeriodSeconds: MIN_STAKE_DURATION.toString()
        })

        await client.destroy()
    })
})
