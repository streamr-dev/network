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
    operatorState: OperatorState
    operatorConfig: OperatorConfig
    stakeableSponsorships: Map<SponsorshipID, SponsorshipConfig>
    environmentConfig: EnvironmentConfig
}) => Action[]

export interface SponsorshipConfig {
    payoutPerSec: WeiAmount
}

export interface OperatorState {
    myCurrentStakes: Map<SponsorshipID, WeiAmount>
    myUnstakedAmount: WeiAmount
}

export interface OperatorConfig {
    operatorContractAddress: string
    minTransactionAmount: WeiAmount
    maxSponsorshipCount?: number
}

export interface EnvironmentConfig {
    minStakePerSponsorship: WeiAmount
}

