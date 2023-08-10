// TODO: copy-paste from network-contracts, import from there?
import { Chain } from "@streamr/config"
import { utils, Wallet, Contract, ContractReceipt } from "ethers"

import { sponsorshipABI, sponsorshipFactoryABI } from "@streamr/network-contracts"
import type { Sponsorship, SponsorshipFactory } from "@streamr/network-contracts"

const { parseEther } = utils

export const DEFAULT_MINIMUM_STAKE = parseEther("60")

export async function deploySponsorship(
    chainConfig: Chain,
    deployer: Wallet, {
        streamId = `Stream-${Date.now()}`,
        metadata = "{}",
        minimumStakeWei = DEFAULT_MINIMUM_STAKE,
        minHorizonSeconds = 0,
        minOperatorCount = 1,
    } = {},
): Promise<Sponsorship> {

    // console.log("Chain config: %o", chainConfig)
    const sponsorshipFactory =
        new Contract(chainConfig.contracts.SponsorshipFactory, sponsorshipFactoryABI, deployer) as unknown as SponsorshipFactory
    // console.log("deployer balance", await deployer.getBalance())
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
            parseEther("0.01"),
            "0",
            "0"
        ]
    )
    const sponsorshipDeployReceipt = await sponsorshipDeployTx.wait() as ContractReceipt
    const newSponsorshipEvent = sponsorshipDeployReceipt.events?.find((e) => e.event === "NewSponsorship")
    const newSponsorshipAddress = newSponsorshipEvent?.args?.sponsorshipContract
    const newSponsorship = new Contract(newSponsorshipAddress, sponsorshipABI, deployer) as unknown as Sponsorship

    return newSponsorship
}
