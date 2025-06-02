export type SponsorshipId = string

/**
 * Actions that should be executed by the operator
 */
export interface Action {
    type: 'stake' | 'unstake'
    sponsorshipId: SponsorshipId
    amount: bigint
}

export type AdjustStakesFn = (opts: {
    operatorState: OperatorState
    operatorConfig: OperatorConfig
    stakeableSponsorships: Map<SponsorshipId, SponsorshipState>
    environmentConfig: EnvironmentConfig
}) => Action[]

/**
 * Namings here reflect [thegraph schema](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-subgraphs/schema.graphql#L435)
 **/
export interface SponsorshipState {
    totalPayoutWeiPerSec: bigint
}

/**
 * Namings here reflect [thegraph schema](https://github.com/streamr-dev/network-contracts/blob/master/packages/network-subgraphs/schema.graphql#L435)
 **/
export interface OperatorState {
    stakes: Map<SponsorshipId, bigint>
    unstakedWei: bigint
}

export interface OperatorConfig {
    maxSponsorshipCount?: number
}

/**
 * Network-wide constants, also available in thegraph
 * @see https://github.com/streamr-dev/network-contracts/blob/master/packages/network-subgraphs/schema.graphql#L226
 */
export interface EnvironmentConfig {
    minimumStakeWei: bigint
}

