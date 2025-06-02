import { sum, WeiAmount } from '@streamr/utils'
import partition from 'lodash/partition'
import sortBy from 'lodash/sortBy'
import { Action, AdjustStakesFn, SponsorshipConfig, SponsorshipID } from './types'

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

type TargetStake = [SponsorshipID, WeiAmount]

const getExpiredSponsorships = (stakes: Map<SponsorshipID, WeiAmount>, stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>): SponsorshipID[] => {
    return [...stakes.keys()].filter((sponsorshipId) => !stakeableSponsorships.has(sponsorshipId))
}
/*
 * Select sponsorships for which we should have some stake
 */
const getSelectedSponsorships = (
    stakes: Map<SponsorshipID, WeiAmount>,
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>,
    totalStakeableWei: WeiAmount,
    minimumStakeWei: WeiAmount,
    maxSponsorshipCount: number | undefined
): SponsorshipID[] => {
    const count = Math.min(
        stakeableSponsorships.size,
        maxSponsorshipCount ?? Infinity,
        Math.floor(Number(totalStakeableWei) / Number(minimumStakeWei))  // as many as we can afford
    )
    const [
        keptSponsorships,
        potentialSponsorships,
    ] = partition([...stakeableSponsorships.keys()], (id) => stakes.has(id))
    return [
        ...keptSponsorships,
        // TODO: add secondary sorting of potentialSponsorships based on operator ID + sponsorship ID
        // idea is: in case of a tie, operators should stake to different sponsorships
        ...sortBy(potentialSponsorships, (id) => -Number(stakeableSponsorships.get(id)!.totalPayoutWeiPerSec))
    ].slice(0, count)        
}

/*
 * Calculate the target stakes for each sponsorship:
 * - for selected sponsorships the stake is minimum stake plus payout-proportional allocation
 * - for expired sponsorships the stake is zero
 */
const getTargetStakes = (
    stakes: Map<SponsorshipID, WeiAmount>,
    selectedSponsorships: SponsorshipID[],
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>,
    totalStakeableWei: WeiAmount,
    minimumStakeWei: WeiAmount
): Map<SponsorshipID, WeiAmount> => {
    const minimumStakesWei = BigInt(selectedSponsorships.length) * minimumStakeWei
    const payoutProportionalWei = totalStakeableWei - minimumStakesWei
    const payoutSumWeiPerSec = sum(selectedSponsorships.map((id) => stakeableSponsorships.get(id)!.totalPayoutWeiPerSec))
    const targetsForSelected: TargetStake[] = selectedSponsorships.map((id) => [
        id,
        minimumStakeWei + payoutProportionalWei * stakeableSponsorships.get(id)!.totalPayoutWeiPerSec / payoutSumWeiPerSec
    ])
    const targetsForExpired: TargetStake[] = getExpiredSponsorships(stakes, stakeableSponsorships).map((id) => [
        id,
        0n
    ]) 
    return new Map([...targetsForSelected, ...targetsForExpired])
}

export const adjustStakes: AdjustStakesFn = ({
    operatorState,
    operatorConfig,
    stakeableSponsorships,
    environmentConfig
}): Action[] => {

    const totalStakeableWei = sum([...operatorState.stakes.values()]) + operatorState.unstakedWei
    const selectedSponsorships = getSelectedSponsorships(
        operatorState.stakes,
        stakeableSponsorships,
        totalStakeableWei,
        environmentConfig.minimumStakeWei,
        operatorConfig.maxSponsorshipCount
    )
    const targetStakes = getTargetStakes(
        operatorState.stakes,
        selectedSponsorships,
        stakeableSponsorships,
        totalStakeableWei,
        environmentConfig.minimumStakeWei
    )

    const differencesWei = [...targetStakes.keys()]
        .map((sponsorshipId) => ({ sponsorshipId, differenceWei: targetStakes.get(sponsorshipId)! - (operatorState.stakes.get(sponsorshipId) ?? 0n) }))
        .filter(({ differenceWei: difference }) => difference !== 0n)

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
