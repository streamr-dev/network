import { WeiAmount } from '@streamr/utils'

export type SponsorshipID = string

/**
 * Actions that should be executed by the operator
 */
export interface Action {
    type: 'stake' | 'unstake'
    sponsorshipId: SponsorshipID
    amount: WeiAmount
}

export type AdjustStakesFn = (opts: {
    myCurrentStakes: Map<SponsorshipID, WeiAmount>
    myUnstakedAmount: WeiAmount
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>
    operatorContractAddress: string
    maxSponsorshipCount: number
    minTransactionAmount: WeiAmount
    minStakePerSponsorship: WeiAmount
}) => Action[]

export interface SponsorshipConfig {
    payoutPerSec: WeiAmount
}

