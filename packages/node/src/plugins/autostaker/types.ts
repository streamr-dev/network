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
    operatorConfig: OperatorConfig
    environmentConfig: EnvironmentConfig
}) => Action[]

export interface SponsorshipConfig {
    payoutPerSec: WeiAmount
}

export interface OperatorConfig {
    operatorContractAddress: string
    minTransactionAmount: WeiAmount
    maxSponsorshipCount?: number
}

export interface EnvironmentConfig {
    minStakePerSponsorship: WeiAmount
}

