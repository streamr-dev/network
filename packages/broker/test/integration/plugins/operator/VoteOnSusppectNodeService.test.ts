import { Logger, waitForCondition } from "@streamr/utils"
import { parseEther } from "ethers/lib/utils"
import StreamrClient from "streamr-client"
import { createWalletAndDeployOperator } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { Provider } from "@ethersproject/abstract-provider"
import { JsonRpcProvider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Contract, ContractFactory, Wallet } from "ethers"
import { IERC677, OperatorFactory, SponsorshipFactory, StreamRegistry, StreamrConfig,
    sponsorshipFactoryABI, sponsorshipFactoryBytecode, streamRegistryABI, 
    streamrConfigABI, streamrConfigBytecode, tokenABI } from "@streamr/network-contracts"
import fetch from "node-fetch"
import { VoteOnSuspectNodeService } from "../../../../src/plugins/operator/VoteOnSuspectNodeService"
import { operatorFactoryABI, operatorFactoryBytecode } from "@streamr/network-contracts"
import { MockProxy, mock } from "jest-mock-extended"
import { VoteOnSuspectNodeHelper } from "../../../../src/plugins/operator/VoteOnSuspectNodeHelper"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

jest.setTimeout(600000)

const logger = new Logger(module)
describe('MaintainTopologyService', () => {
    let provider: Provider
    let adminWallet: Wallet
    let token: IERC677
    let streamId1: string
    let streamId2: string

    const chainURL = config.rpcEndpoints[0].url

    // const getOperators

    async function deployOperatorFactory(signer: Wallet): Promise<OperatorFactory> {
        const operatorTemplateAddress = "0x699B4bE95614f017Bb622e427d3232837Cc814E6"
        const sponsorshipTemplateAddress = "0x8f83273a293292b0142d810623568Ea5A248CA58"
        // const {
        //     token, streamrConfig,
        //     defaultDelegationPolicy, defaultPoolYieldPolicy, defaultUndelegationPolicy,
        // } = contracts

        // deploy new streamrconfig
        const streamrConfigFactory = new ContractFactory(streamrConfigABI, streamrConfigBytecode, signer)
        const streamrConfig = await streamrConfigFactory.deploy() as unknown as StreamrConfig
        await streamrConfig.deployed()
        await (await streamrConfig.initialize()).wait()

        // deploy contractfactory
        const operatorFactoryFactory = new ContractFactory(operatorFactoryABI, operatorFactoryBytecode, signer)
        const operatorFactory = await operatorFactoryFactory.deploy() as unknown as OperatorFactory
        await operatorFactory.deployed()
        await (await operatorFactory.initialize(
            operatorTemplateAddress,
            config.contracts.LINK,
            streamrConfig.address
        )).wait()
        await (await operatorFactory.addTrustedPolicies([
            config.contracts.DefaultDelegationPolicy,
            config.contracts.DefaultPoolYieldPolicy,
            config.contracts.DefaultUndelegationPolicy,
            config.contracts.MaxOperatorsJoinPolicy,
            config.contracts.OperatorContractOnlyJoinPolicy   
        ], { gasLimit: 500000 })).wait()

        // deplyo sponsorshipfactory
        const sponsorshipFactoryFactory = new ContractFactory(sponsorshipFactoryABI, sponsorshipFactoryBytecode, signer)
        const sponsorshipFactory = await sponsorshipFactoryFactory.deploy() as unknown as SponsorshipFactory
        await sponsorshipFactory.deployed()
        await (await sponsorshipFactory.initialize(
            sponsorshipTemplateAddress,
            config.contracts.LINK,
            streamrConfig.address
        )).wait()
        await (await sponsorshipFactory.addTrustedPolicies([
            config.contracts.StakeWeightedAllocationPolicy,
            config.contracts.DefaultLeavePolicy,
            config.contracts.VoteKickPolicy
        ])).wait()

        // link factories in streamrconfig
        await (await streamrConfig.setSponsorshipFactory(config.contracts.SponsorshipFactory)).wait()
        await (await streamrConfig.setOperatorFactory(operatorFactory.address)).wait()

        // update local config with new addresses
        // eslint-disable-next-line require-atomic-updates
        config.contracts.StreamrConfig = streamrConfig.address
        // eslint-disable-next-line require-atomic-updates
        config.contracts.OperatorFactory = operatorFactory.address
        // eslint-disable-next-line require-atomic-updates
        config.contracts.SponsorshipFactory = sponsorshipFactory.address

        // const streamrConfig = new Contract(config.contracts.StreamrConfig, streamrConfigABI) as unknown as StreamrConfig

        // await (await operatorFactory.initialize(
        //     operatorTemplate!.address,
        //     token!.address,
        //     streamrConfig!.address,
        //     { gasLimit: 500000 } // solcover makes the gas estimation require 1000+ ETH for transaction, this fixes it
        // )).wait()

        return operatorFactory
    }

    beforeAll(async () => {
        provider = new JsonRpcProvider(chainURL)
        logger.debug("Connected to: ", await provider.getNetwork())

        const streamCreatorKey = "0xd7609ae3a29375768fac8bc0f8c2f6ac81c5f2ffca2b981e6cf15460f01efe14"
        adminWallet = new Wallet(streamCreatorKey, provider)
    
        token = new Contract(config.contracts.LINK, tokenABI) as unknown as IERC677
        const timeString = (new Date()).getTime().toString()
        const streamPath1 = "/operatorclienttest-1-" + timeString
        const streamPath2 = "/operatorclienttest-2-" + timeString
        streamId1 = adminWallet.address.toLowerCase() + streamPath1
        streamId2 = adminWallet.address.toLowerCase() + streamPath2
        const streamRegistry = new Contract(config.contracts.StreamRegistry, streamRegistryABI, adminWallet) as unknown as StreamRegistry
        logger.debug(`creating stream with streamId1 ${streamId1}`)
        await (await streamRegistry.createStream(streamPath1, '{"partitions":"1"}')).wait()
        logger.debug(`creating stream with streamId2 ${streamId2}`)
        await (await streamRegistry.createStream(streamPath2, '{"partitions":"1"}')).wait()

    })
    
    it("allows to flag an operator as malicious", async () => {
        const operatorFactory = await deployOperatorFactory(adminWallet)
        const newOperatorFactoryChainConfig = Chains.load()["dev1"]
        newOperatorFactoryChainConfig.contracts.OperatorFactory = operatorFactory.address
        const flagger = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch)
        logger.debug("deployed flagger contract " + flagger.operatorConfig.operatorContractAddress)
        const target = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch)
        logger.debug("deployed target contract " + target.operatorConfig.operatorContractAddress)
        const voter = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch)
        logger.debug("deployed voter contract " + voter.operatorConfig.operatorContractAddress)

        await new Promise((resolve) => setTimeout(resolve, 5000)) // wait for events to be processed
        const flaggerClient: MockProxy<StreamrClient> = mock<StreamrClient>()
        const flaggerVoteService = new VoteOnSuspectNodeService(flaggerClient, flagger.operatorConfig)
        await flaggerVoteService.start()

        const targetClient: MockProxy<StreamrClient> = mock<StreamrClient>()
        const targetVoteService = new VoteOnSuspectNodeService(targetClient, target.operatorConfig)
        await targetVoteService.start()
        expect(targetClient.subscribe.mock.calls.length).toBe(0)

        const voterClient: MockProxy<StreamrClient> = mock<StreamrClient>()
        const voterVoteService = new VoteOnSuspectNodeService(voterClient, voter.operatorConfig)
        await voterVoteService.start()

        logger.debug("deploying sponsorship contract")
        const sponsorship = await deploySponsorship(config, adminWallet, {
            streamId: streamId1 })
        logger.debug("sponsoring sponsorship contract")
        await (await token.connect(flagger.operatorWallet).approve(sponsorship.address, parseEther("500"))).wait()
        await (await sponsorship.connect(flagger.operatorWallet).sponsor(parseEther("500"))).wait()

        // operatorf - config - sponsonripfactory
        // of2 - config

        logger.debug("each operator delegates to its operactor contract")
        logger.debug("delegating from flagger: " + flagger.operatorWallet.address)
        await (await token.connect(flagger.operatorWallet).transferAndCall(flagger.operatorContract.address,
            parseEther("200"), flagger.operatorWallet.address)).wait()
        logger.debug("delegating from target: " + target.operatorWallet.address)
        await (await token.connect(target.operatorWallet).transferAndCall(target.operatorContract.address,
            parseEther("200"), target.operatorWallet.address)).wait()
        logger.debug("delegating from voter: " + voter.operatorWallet.address)
        await (await token.connect(voter.operatorWallet).transferAndCall(voter.operatorContract.address,
            parseEther("200"), voter.operatorWallet.address)).wait()
        
        logger.debug("staking to sponsorship contract from flagger and target and voter")
        logger.debug("staking from flagger: " + flagger.operatorContract.address)
        await (await flagger.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        logger.debug("staking from target: " + target.operatorContract.address)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        await (await target.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        logger.debug("staking from voter: " + voter.operatorContract.address)
        await new Promise((resolve) => setTimeout(resolve, 3000))
        await (await voter.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        await new Promise((resolve) => setTimeout(resolve, 3000))

        logger.debug("registering node addresses")
        await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()

        logger.debug("flagging target operator")
        const mockVoteOnSuspectNodeHelper = mock<VoteOnSuspectNodeHelper>()
        // @ts-expect-error mock
        voterVoteService.voteOnSuspectNodeHelper = mockVoteOnSuspectNodeHelper
        const tr = await (await flagger.operatorContract.flag(sponsorship.address, target.operatorContract.address)).wait()
        await new Promise((resolve) => setTimeout(resolve, 10000))
        // check that voter votes
        await waitForCondition(async () => {
            return mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls.length > 0 &&
            mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls[0][0] === target.operatorContract.address &&
            mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls[0][1] === sponsorship.address &&
            mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls[0][2] === true
        }, 10000, 1000)
        flaggerVoteService.stop()
    })
})
