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

/**
 * Namings here reflect [thegraph schema](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-subgraphs/schema.graphql#L435)
 **/
export interface SponsorshipConfig {
    totalPayoutWeiPerSec: WeiAmount
}

/**
 * Namings here reflect [thegraph schema](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-subgraphs/schema.graphql#L435)
 **/
export interface OperatorState {
    stakes: Map<SponsorshipID, WeiAmount>
    unstakedWei: WeiAmount
}

export interface OperatorConfig {
    maxSponsorshipCount?: number
    minTransactionWei: WeiAmount
    operatorContractAddress: string
}

/**
 * Network-wide constants, also available in thegraph
 * @see https://github.com/streamr-dev/network-contracts/blob/master/packages/network-subgraphs/schema.graphql#L226
 */
export interface EnvironmentConfig {
    minimumStakeWei: WeiAmount  // TODO rename to minStakeWei?
}

