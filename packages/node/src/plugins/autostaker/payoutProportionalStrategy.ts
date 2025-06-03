import { WeiAmount } from '@streamr/utils'
import crypto from 'crypto'
import maxBy from 'lodash/maxBy'
import minBy from 'lodash/minBy'
import partition from 'lodash/partition'
import pull from 'lodash/pull'
import sortBy from 'lodash/sortBy'
import { Action, AdjustStakesFn, SponsorshipConfig, SponsorshipID } from './types'

/**
 * Allocate stake in proportion to the payout each sponsorship gives.
 * Detailed allocation formula: each sponsorship should get the stake M + P / T,
 *   where M is the environment-mandated minimum stake,
 *         P is `payoutPerSec` of the considered sponsorship, and
 *         T is sum of `payoutPerSec` of all sponsorships this operator stakes to.
 * `payoutPerSec` is the total payout per second to all staked operators.
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

const sum = (values: bigint[]): bigint =>{
    return values.reduce((acc, value) => acc + value, 0n)
}

const abs = (n: bigint) => (n < 0n) ? -n : n

const getExpiredSponsorships = (
    stakes: Map<SponsorshipID, WeiAmount>,
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>
): SponsorshipID[] => {
    return [...stakes.keys()].filter((sponsorshipId) => !stakeableSponsorships.has(sponsorshipId))
}
/*
 * Select sponsorships for which we should have some stake
 */
const getSelectedSponsorships = (
    stakes: Map<SponsorshipID, WeiAmount>,
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>,
    totalStakeableAmount: WeiAmount,
    minStakePerSponsorship: WeiAmount,
    maxSponsorshipCount: number | undefined,
    operatorContractAddress: string
): SponsorshipID[] => {
    const count = Math.min(
        stakeableSponsorships.size,
        maxSponsorshipCount ?? Infinity,
        Math.floor(Number(totalStakeableAmount) / Number(minStakePerSponsorship))  // as many as we can afford
    )
    const [
        keptSponsorships,
        potentialSponsorships,
    ] = partition([...stakeableSponsorships.keys()], (id) => stakes.has(id))
    return [
        ...keptSponsorships,
        ...sortBy(potentialSponsorships, 
            (id) => -Number(stakeableSponsorships.get(id)!.payoutPerSec),
            (id) => {
                // If payoutPerSec is same for multiple sponsorships, different operators should
                // choose different sponsorships. Using hash of some operator-specific ID + sponsorshipId
                // to determine the order. Here we use operatorContractAddress, but it could also
                // be e.g. the nodeId.
                const buffer = crypto.createHash('md5').update(operatorContractAddress + id).digest()
                return buffer.readInt32LE(0)
            }
        )
    ].slice(0, count)        
}

/*
 * Calculate the target stakes for each sponsorship:
 * - for selected sponsorships the stake is minimum stake plus payout-proportional allocation
 * - for expired sponsorships the stake is zero
 */
const getTargetStakes = (
    stakes: Map<SponsorshipID, WeiAmount>,
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>,
    unstakedAmount: WeiAmount,
    minStakePerSponsorship: WeiAmount,
    maxSponsorshipCount: number | undefined,
    operatorContractAddress: string
): Map<SponsorshipID, WeiAmount> => {
    const totalStakeableAmount = sum([...stakes.values()]) + unstakedAmount
    const selectedSponsorships = getSelectedSponsorships(
        stakes,
        stakeableSponsorships,
        totalStakeableAmount,
        minStakePerSponsorship,
        maxSponsorshipCount,
        operatorContractAddress
    )
    const minStakePerSponsorshipSum = BigInt(selectedSponsorships.length) * minStakePerSponsorship
    const payoutProportionalAmount = totalStakeableAmount - minStakePerSponsorshipSum
    const payoutPerSecSum = sum(selectedSponsorships.map((id) => stakeableSponsorships.get(id)!.payoutPerSec))
    const targetsForSelected: TargetStake[] = selectedSponsorships.map((id) => [
        id,
        minStakePerSponsorship + payoutProportionalAmount * stakeableSponsorships.get(id)!.payoutPerSec / payoutPerSecSum
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

    const targetStakes = getTargetStakes(
        operatorState.stakes,
        stakeableSponsorships,
        operatorState.unstakedAmount,
        environmentConfig.minStakePerSponsorship,
        operatorConfig.maxSponsorshipCount,
        operatorConfig.operatorContractAddress
    )

    const adjustments = [...targetStakes.keys()]
        .map((sponsorshipId) => ({ 
            sponsorshipId,
            difference: targetStakes.get(sponsorshipId)! - (operatorState.stakes.get(sponsorshipId) ?? 0n)
        }))
        .filter(({ difference: difference }) => difference !== 0n)

    // fix rounding errors by forcing the net staking to equal unstakedAmount: adjust the largest staking
    const netStakingAmount = sum(adjustments.map((a) => a.difference))
    if (netStakingAmount !== operatorState.unstakedAmount && stakeableSponsorships.size > 0 && adjustments.length > 0) {
        const largestDifference = maxBy(adjustments, (a) => Number(a.difference))!
        largestDifference.difference += operatorState.unstakedAmount - netStakingAmount
        if (largestDifference.difference === 0n) {
            pull(adjustments, largestDifference)
        }
    }

    const tooSmallAdjustments = adjustments.filter((a) => abs(a.difference) < operatorConfig.minTransactionAmount)
    if (tooSmallAdjustments.length > 0) {
        pull(adjustments, ...tooSmallAdjustments)
        let netDifference = sum(tooSmallAdjustments.map((a) => a.difference))
        while (netDifference < 0) {
            // there are more stakings than unstakings: remove smallest of the stakings
            const smallestStaking = minBy(adjustments.filter((a) => a.difference > 0), (a) => Number(a.difference))!
            pull(adjustments, smallestStaking)
            netDifference += smallestStaking.difference
        }
    }

    return sortBy(
        adjustments.map(({ sponsorshipId, difference }) => ({
            type: difference > 0n ? 'stake' : 'unstake',
            sponsorshipId,
            amount: difference > 0n ? difference : -difference
        })),
        (action) => ['unstake', 'stake'].indexOf(action.type)
    )
}
