// TODO: copy-paste from network-contracts, import from there?
import { utils, Wallet, Contract, ContractReceipt } from 'ethers'

import { Logger } from '@streamr/utils'

import { sponsorshipABI, sponsorshipFactoryABI } from '@streamr/network-contracts'
import type { Sponsorship, SponsorshipFactory } from '@streamr/network-contracts'

const { parseEther } = utils

const logger = new Logger(module)

export async function deploySponsorship(
    // eslint-disable-next-line max-len
    chainConfig: { contracts: { SponsorshipFactory: string, SponsorshipStakeWeightedAllocationPolicy: string, SponsorshipDefaultLeavePolicy: string, SponsorshipVoteKickPolicy: string } },
    deployer: Wallet, {
        streamId = `Stream-${Date.now()}`,
        metadata = '{}',
        minimumStakeWei = parseEther('60'),
        minHorizonSeconds = 0,
        minOperatorCount = 1,
        earningsPerSecond = parseEther('0.01'),
    } = {},
): Promise<Sponsorship> {
    const { contracts } = chainConfig

    const sponsorshipFactory = new Contract(contracts.SponsorshipFactory, sponsorshipFactoryABI, deployer) as unknown as SponsorshipFactory

    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        minimumStakeWei.toString(),
        minHorizonSeconds.toString(),
        minOperatorCount.toString(),
        streamId,
        metadata,
        [
            contracts.SponsorshipStakeWeightedAllocationPolicy,
            contracts.SponsorshipDefaultLeavePolicy,
            contracts.SponsorshipVoteKickPolicy,
        ], [
            earningsPerSecond,
            '0',
            '0'
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait() as ContractReceipt
    const newSponsorshipEvent = sponsorshipDeployReceipt.events?.find((e) => e.event === 'NewSponsorship')
    const newSponsorshipAddress = newSponsorshipEvent?.args?.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, sponsorshipABI, deployer) as unknown as Sponsorship

    return newSponsorship
}
