// TODO: copy-paste from network-contracts, import from there?
import type { Sponsorship, SponsorshipFactory } from '@streamr/network-contracts'
import { sponsorshipABI, sponsorshipFactoryABI } from '@streamr/network-contracts'
import { Contract, ContractReceipt, Wallet, utils } from 'ethers'

const { parseEther } = utils

export async function deploySponsorship(
    // eslint-disable-next-line max-len
    chainConfig: { contracts: { SponsorshipFactory: string, SponsorshipStakeWeightedAllocationPolicy: string, SponsorshipDefaultLeavePolicy: string, SponsorshipVoteKickPolicy: string } },
    deployer: Wallet, 
    {
        streamId = `Stream-${Date.now()}`,
        metadata = '{}',
        minimumStakeWei = parseEther('60'),
        minHorizonSeconds = 0,
        minOperatorCount = 1,
    } = {},
): Promise<Sponsorship> {
    const sponsorshipFactory =
        new Contract(chainConfig.contracts.SponsorshipFactory, sponsorshipFactoryABI, deployer) as unknown as SponsorshipFactory
    const sponsorshipDeployTx = await sponsorshipFactory.deploySponsorship(
        minimumStakeWei.toString(),
        minHorizonSeconds.toString(),
        minOperatorCount.toString(),
        streamId,
        metadata,
        [
            chainConfig.contracts.SponsorshipStakeWeightedAllocationPolicy,
            chainConfig.contracts.SponsorshipDefaultLeavePolicy,
            chainConfig.contracts.SponsorshipVoteKickPolicy,
        ], [
            parseEther('0.01'),
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
