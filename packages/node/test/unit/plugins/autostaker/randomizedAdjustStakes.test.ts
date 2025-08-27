import { randomString, Logger } from '@streamr/utils'
import { adjustStakes } from '../../../../src/plugins/autostaker/payoutProportionalStrategy'

const logger = new Logger(module)

const TEST_CONFIG = {
    NUM_SCENARIOS: 2000,
    MAX_SPONSORSHIPS: 20,
    MAX_STAKE: 100_000n,
    MIN_STAKE: 5_000n,
    MAX_PAYOUT: 100n,
    MIN_PAYOUT: 1n,
    MAX_UNSTAKED: 300_000n,
    MAX_UNDELEGATION: 10_000n,
    MAX_UNSTAKED_PERCENTAGE: 5
}

function bigIntMin(...args: bigint[]): bigint {
    return args.reduce((m, e) => e < m ? e : m)
}

function coinFlip(): boolean {
    return Math.random() < 0.5
}

function generateRandomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateRandomBigInt(min: bigint, max: bigint): bigint {
    return BigInt(Math.floor(Math.random() * Number(max - min + 1n)) + Number(min))
}

function generateStakeableSponsorships(count: number): Map<string, { payoutPerSec: bigint }> {
    const sponsorshipIds = Array.from({ length: count }, () => randomString(6))
    return new Map(
        sponsorshipIds.map((id) => [
            id,
            { payoutPerSec: generateRandomBigInt(TEST_CONFIG.MIN_PAYOUT, TEST_CONFIG.MAX_PAYOUT) }
        ])
    )
}

function calculateUnstakedPercentage(
    initialUnstaked: bigint,
    actions: { type: 'stake' | 'unstake', amount: bigint }[],
    totalTokens: bigint,
    undelegationQueueAmount: bigint
): number {
    if (actions.length === 0) {
        return Number(initialUnstaked / totalTokens) / 100 // undelegation queue is not activated if no actions
    }
    let unstaked = initialUnstaked
    let leftInUndelegationQueueAmount = undelegationQueueAmount
    for (const action of actions) {
        if (action.type === 'stake') {
            unstaked -= action.amount
        } else if (action.type === 'unstake') {
            let amountAfterQueue = action.amount
            if (leftInUndelegationQueueAmount > 0n) {
                const reduction = bigIntMin(action.amount, leftInUndelegationQueueAmount)
                leftInUndelegationQueueAmount -= reduction
                amountAfterQueue -= reduction
            }
            unstaked += amountAfterQueue
        }
    }
    // Subtract undelegation queue amount from total tokens for percentage calculation
    const availableTokens = totalTokens - (undelegationQueueAmount - leftInUndelegationQueueAmount)
    return availableTokens === 0n ? 0 : Number(unstaked * 10000n / availableTokens) / 100
}

it(`randomized scenarios should not leave more than ${TEST_CONFIG.MAX_UNSTAKED_PERCENTAGE}% tokens unstaked`, () => {

    function generateCurrentStakes(sponsorshipIds: string[], count: number): Map<string, bigint> {
        const allPossibleIds = [...sponsorshipIds]
        // Add some expired sponsorships
        for (let j = 0; j < 2; j++) { // TODO: shoudl 2 be here configurable or ratio-based?
            allPossibleIds.push('EXP' + randomString(4))
        }

        return new Map(
            Array.from({ length: count }, () => {
                const id = allPossibleIds[Math.floor(Math.random() * allPossibleIds.length)]
                return [id, generateRandomBigInt(TEST_CONFIG.MIN_STAKE, TEST_CONFIG.MAX_STAKE)]
            })
        )
    }

    let failed = 0
    for (let i = 0; i < TEST_CONFIG.NUM_SCENARIOS; i++) {
        /** Setup random scenario */
        const sponsorshipCount = generateRandomInt(1, TEST_CONFIG.MAX_SPONSORSHIPS)
        const stakeableSponsorships = generateStakeableSponsorships(sponsorshipCount)
        const sponsorshipIds = Array.from(stakeableSponsorships.keys())

        const currentStakeCount = generateRandomInt(0, sponsorshipCount + 2)
        const myCurrentStakes = generateCurrentStakes(sponsorshipIds, currentStakeCount)
        const totalTokensInCurrentStakes = Array.from(myCurrentStakes.values()).reduce((a, b) => a + b, 0n)

        let myUnstakedAmount
        let undelegationQueueAmount
        if (coinFlip()) {
            myUnstakedAmount = generateRandomBigInt(0n, TEST_CONFIG.MAX_UNSTAKED)
            undelegationQueueAmount = 0n
        } else {
            myUnstakedAmount = 0n
            // ensure undelegation queue amount never exceeds total tokens
            undelegationQueueAmount = generateRandomBigInt(0n, bigIntMin(totalTokensInCurrentStakes, TEST_CONFIG.MAX_UNDELEGATION))
        }

        const operatorContractAddress = '0x' + randomString(40)
        const maxSponsorshipCount = generateRandomInt(1, TEST_CONFIG.MAX_SPONSORSHIPS)
        const minTransactionAmount = 1000n
        const minStakePerSponsorship = 5000n

        /** Run action **/
        const actions = adjustStakes({
            myUnstakedAmount,
            myCurrentStakes,
            stakeableSponsorships,
            undelegationQueueAmount,
            operatorContractAddress,
            maxSponsorshipCount,
            minTransactionAmount,
            minStakePerSponsorship
        })

        /** Validate results **/
        const totalTokens = myUnstakedAmount + totalTokensInCurrentStakes
        const percentUnstaked = totalTokens === 0n
            ? 0
            : calculateUnstakedPercentage(myUnstakedAmount, actions, totalTokens, undelegationQueueAmount)

        logger.info(`Scenario ${i + 1}: ${percentUnstaked}% tokens left unstaked`, { initialTotalTokens: totalTokens })

        const availableTokens = totalTokens - undelegationQueueAmount
        const hasAvailableTokensForAtLeastOneSponsorship = availableTokens >= minStakePerSponsorship
        if ((percentUnstaked > TEST_CONFIG.MAX_UNSTAKED_PERCENTAGE || percentUnstaked < 0) && hasAvailableTokensForAtLeastOneSponsorship) {
            failed++
            // Print arguments in copy-paste format when test fails
            logger.error(`Test failed for scenario ${i + 1}. Copy-paste this as argument to adjustStakes:`)
            logger.error(`{
    myUnstakedAmount: ${myUnstakedAmount}n,
    myCurrentStakes: new Map([
        ${Array.from(myCurrentStakes.entries()).map(([k, v]) => `['${k}', ${v}n]`).join(',\n        ')}
    ]),
    stakeableSponsorships: new Map([
        ${Array.from(stakeableSponsorships.entries()).map(([k, v]) => `['${k}', { payoutPerSec: ${v.payoutPerSec}n }]`).join(',\n        ')}
    ]),
    undelegationQueueAmount: ${undelegationQueueAmount}n,
    operatorContractAddress: '${operatorContractAddress}',
    maxSponsorshipCount: ${maxSponsorshipCount},
    minTransactionAmount: ${minTransactionAmount}n,
    minStakePerSponsorship: ${minStakePerSponsorship}n
}`)
            fail('assertion failed')
        }
    }

    if (failed > 0) {
        logger.warn(`${failed} scenarios failed the unstaked percentage check`)
    }
})

it('test v2', () => {
    const runConfig = {
        myUnstakedAmount: 0n,
        myCurrentStakes: new Map([
            ['tSJrLT', 6101n],
            ['BUybs7', 74208n],
            ['LdTXVL', 9580n]
        ]),
        stakeableSponsorships: new Map([
            ['BUybs7', { payoutPerSec: 15n }],
            ['UClH4l', { payoutPerSec: 56n }],
            ['SPbxFJ', { payoutPerSec: 25n }],
            ['cJ2M9l', { payoutPerSec: 13n }],
            ['5v82OV', { payoutPerSec: 96n }],
            ['E1bD1N', { payoutPerSec: 32n }],
            ['U4xghy', { payoutPerSec: 66n }],
            ['2LrBmh', { payoutPerSec: 100n }],
            ['kvlbVj', { payoutPerSec: 100n }],
            ['3JuSyJ', { payoutPerSec: 68n }],
            ['tSJrLT', { payoutPerSec: 67n }],
            ['sYcm8O', { payoutPerSec: 53n }],
            ['LdTXVL', { payoutPerSec: 26n }],
            ['ueIWh5', { payoutPerSec: 91n }],
            ['YKb5ew', { payoutPerSec: 73n }],
            ['oLIe4I', { payoutPerSec: 55n }],
            ['KuVdBm', { payoutPerSec: 95n }],
            ['Qn9AwP', { payoutPerSec: 62n }],
            ['JCNe5c', { payoutPerSec: 32n }]
        ]),
        undelegationQueueAmount: 7147n,
        operatorContractAddress: '0xjjBZsQy2i1XYuLkIqih69U034xasnhUUxMJS7Pae',
        maxSponsorshipCount: 15,
        minTransactionAmount: 1000n,
        minStakePerSponsorship: 5000n
    }
    const actions = adjustStakes(runConfig)
    const totalTokens = runConfig.myUnstakedAmount + Array.from(runConfig.myCurrentStakes.values()).reduce((a, b) => a + b, 0n)
    const percentUnstaked = totalTokens === 0n
        ? 0
        : calculateUnstakedPercentage(runConfig.myUnstakedAmount, actions, totalTokens, runConfig.undelegationQueueAmount)
    logger.info(`v2 ${percentUnstaked}% tokens left unstaked`)
    expect(actions).toEqual([])
})
