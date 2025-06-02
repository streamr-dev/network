import { sum, WeiAmount } from '@streamr/utils'
import partition from 'lodash/partition'
import { Action, AdjustStakesFn, EnvironmentConfig, OperatorConfig, OperatorState, SponsorshipID, SponsorshipConfig } from './types'

/**
 * Allocate stake in proportion to the payout each sponsorship gives.
 * Detailed allocation formula: each sponsorship should get the stake M + P / T,
 *   where M is the environment-mandated minimum stake,
 *         P is `totalPayoutWeiPerSec` of the considered sponsorship, and
 *         T is sum of `totalPayoutWeiPerSec` of all sponsorships this operator stakes to.
 * `totalPayoutWeiPerSec` is the total payout per second to all staked operators.
 *
 * In order to prevent that operators' actions cause other operators to change their plans,
 *   this strategy only takes into account the payout, not what others have staked.
 *
 * In order to also prevent too much churn (joining and leaving),
 *   this strategy will keep those sponsorships that they already have staked to, as long as they keep paying.
 * Eventually sponsorships expire, and then the strategy will reallocate that stake elsewhere.
 *
 * This strategy tries to stake to as many sponsorships as it can afford.
 * Since smaller amounts than the minimum stake can't be staked,
 *   the tokens available to the operator limits the number of sponsorships they can stake to.
 *
 * Example:
 * - there are sponsorships that pay out 2, 4, and 6 DATA/sec respectively.
 * - minimum stake is 5000 DATA
 * - operator has 11000 DATA (tokens in the contract plus currently staked tokens)
 * 1. it only has enough for 2 sponsorships, so it chooses the ones that pay 4 and 6 DATA/sec
 * 2. it allocates 5000 DATA to each of the 2 sponsorships (minimum stake)
 * 3. it allocates the remaining 1000 DATA in proportion to the payout:
 *   - 1000 * 4 / 10 = 400 DATA to the 4-paying sponsorship
 *   - 1000 * 6 / 10 = 600 DATA to the 6-paying sponsorship
 * - final target stakes are: 0, 5400, and 5600 DATA to the three sponsorships
 * - the algorithm then outputs the stake and unstake actions to change the allocation to the target
 **/

const getTargetStakes = (
    operatorState: OperatorState,
    operatorConfig: OperatorConfig,
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>,
    environmentConfig: EnvironmentConfig
): Map<SponsorshipID, WeiAmount> => {

    const totalStakeableWei = sum([...operatorState.stakes.values()]) + operatorState.unstakedWei
    // find the number of sponsorships that we can afford to stake to
    const targetSponsorshipCount = Math.min(
        stakeableSponsorships.size,
        operatorConfig.maxSponsorshipCount ?? Infinity,
        Math.floor(Number(totalStakeableWei) / Number(environmentConfig.minimumStakeWei)),
    )

    const sponsorshipList = Array.from(stakeableSponsorships.entries()).map(
        ([id, { totalPayoutWeiPerSec }]) => ({ id, totalPayoutWeiPerSec })
    )

    // separate the stakeable sponsorships that we already have stakes in
    const [
        keptSponsorships,
        potentialSponsorships,
    ] = partition(sponsorshipList, ({ id }) => operatorState.stakes.has(id))

    // TODO: add secondary sorting of potentialSponsorships based on operator ID + sponsorship ID
    // idea is: in case of a tie, operators should stake to different sponsorships

    // pad the kept sponsorships to the target number, in the order of decreasing payout
    potentialSponsorships.sort((a, b) => Number(b.totalPayoutWeiPerSec) - Number(a.totalPayoutWeiPerSec))
    const selectedSponsorships = keptSponsorships
        .concat(potentialSponsorships)
        .slice(0, targetSponsorshipCount)

    // calculate the target stakes for each sponsorship: minimum stake plus payout-proportional allocation
    const minimumStakesWei = BigInt(selectedSponsorships.length) * environmentConfig.minimumStakeWei
    const payoutProportionalWei = totalStakeableWei - minimumStakesWei
    const payoutSumWeiPerSec = sum(selectedSponsorships.map(({ totalPayoutWeiPerSec }) => totalPayoutWeiPerSec))

    return new Map(payoutSumWeiPerSec > 0n ? selectedSponsorships.map(({ id, totalPayoutWeiPerSec }) =>
        [id, environmentConfig.minimumStakeWei + payoutProportionalWei * totalPayoutWeiPerSec / payoutSumWeiPerSec]) : [])
}

export const adjustStakes: AdjustStakesFn = ({
    operatorState,
    operatorConfig,
    stakeableSponsorships,
    environmentConfig
}): Action[] => {

    const targetStakes = getTargetStakes(operatorState, operatorConfig, stakeableSponsorships, environmentConfig)

    // calculate the stake differences for all sponsorships we have stakes in, or want to stake into
    const sponsorshipIdList = Array.from(new Set([...operatorState.stakes.keys(), ...targetStakes.keys()]))
    const differencesWei = sponsorshipIdList.map((sponsorshipId) => ({
        sponsorshipId,
        differenceWei: (targetStakes.get(sponsorshipId) ?? 0n) - (operatorState.stakes.get(sponsorshipId) ?? 0n)
    })).filter(({ differenceWei: difference }) => difference !== 0n)

    // TODO: filter out too small (TODO: decide what "too small" means) stakings and unstakings because those just waste gas

    // sort the differences in ascending order (unstakings first, then stakings)
    differencesWei.sort((a, b) => Number(a.differenceWei) - Number(b.differenceWei))

    // force the net staking to equal unstakedWei (fixes e.g. rounding errors) by adjusting the largest staking (last in list)
    const netStakingWei = sum(differencesWei.map(({ differenceWei: difference }) => difference))
    if (netStakingWei !== operatorState.unstakedWei && stakeableSponsorships.size > 0 && differencesWei.length > 0) {
        const largestDifference = differencesWei.pop()!
        largestDifference.differenceWei += operatorState.unstakedWei - netStakingWei
        // don't push back a zero difference
        if (largestDifference.differenceWei !== 0n) {
            differencesWei.push(largestDifference)
        }
    }

    // convert differences to actions
    return differencesWei.map(({ sponsorshipId, differenceWei }) => ({
        type: differenceWei > 0n ? 'stake' : 'unstake',
        sponsorshipId,
        amount: differenceWei > 0n ? differenceWei : -differenceWei
    }))
}
