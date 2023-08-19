// TODO: copy-paste from network-contracts, import from there?
import { parseEther } from '@ethersproject/units'
import type { Sponsorship, SponsorshipFactory } from '@streamr/network-contracts'
import { sponsorshipABI, sponsorshipFactoryABI } from '@streamr/network-contracts'
import { BigNumber, Contract, ContractReceipt, Wallet } from 'ethers'

export interface DeploySponsorshipOpts {
    // eslint-disable-next-line max-len
    chainConfig: { contracts: { SponsorshipFactory: string, SponsorshipStakeWeightedAllocationPolicy: string, SponsorshipDefaultLeavePolicy: string, SponsorshipVoteKickPolicy: string } }
    deployer: Wallet
    streamId?: string
    metadata?: string
    minimumStakeWei?: BigNumber
    minHorizonSeconds?: number
    minOperatorCount?: number
}

export async function deploySponsorship(
    opts: DeploySponsorshipOpts
): Promise<Sponsorship> {
    const sponsorshipFactory =
        new Contract(opts.chainConfig.contracts.SponsorshipFactory, sponsorshipFactoryABI, opts.deployer) as unknown as SponsorshipFactory
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        (opts.minimumStakeWei ?? parseEther('60')).toString(),
        (opts.minHorizonSeconds ?? 0).toString(),
        (opts.minOperatorCount ?? 1).toString(),
        opts.streamId ?? `Stream-${Date.now()}`,
        opts.metadata ?? '{}',
        [
            opts.chainConfig.contracts.SponsorshipStakeWeightedAllocationPolicy,
            opts.chainConfig.contracts.SponsorshipDefaultLeavePolicy,
            opts.chainConfig.contracts.SponsorshipVoteKickPolicy,
        ], [
            parseEther('0.01'),
            '0',
            '0'
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait() as ContractReceipt
    const newSponsorshipEvent = sponsorshipDeployReceipt.events?.find((e) => e.event === 'NewSponsorship')
    const newSponsorshipAddress = newSponsorshipEvent?.args?.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, sponsorshipABI, opts.deployer) as unknown as Sponsorship
    return newSponsorship
}
