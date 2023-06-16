import { fetchPrivateKeyWithGas } from "@streamr/test-utils"
import { Logger, TheGraphClient, waitForCondition } from "@streamr/utils"
import { parseEther } from "ethers/lib/utils"
import StreamrClient, { Stream, CONFIG_TEST, StreamPartID } from "streamr-client"
import { MaintainTopologyService } from "../../../../src/plugins/operator/MaintainTopologyService"
import { createWalletAndDeployOperator } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { Provider } from "@ethersproject/abstract-provider"
import { JsonRpcProvider } from "@ethersproject/providers"
import { Chains } from "@streamr/config"
import { Contract, ContractFactory, Wallet } from "ethers"
import { IERC677, Operator, OperatorFactory, StreamRegistry, StreamrConfig, streamRegistryABI, streamrConfigABI, streamrConfigBytecode, tokenABI } from "@streamr/network-contracts"
import fetch from "node-fetch"
import { VoteOnSuspectNodeService } from "../../../../src/plugins/operator/VoteOnSuspectNodeService"
import { operatorFactoryABI, operatorFactoryBytecode } from "@streamr/network-contracts"

const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

jest.setTimeout(600000)

const logger = new Logger(module)
describe('MaintainTopologyService', () => {
    let service: MaintainTopologyService
    let client: StreamrClient
    let provider: Provider
    let adminWallet: Wallet
    let token: IERC677
    let streamId1: string
    let streamId2: string

    const chainURL = config.rpcEndpoints[0].url

    // const getOperators

    async function deployOperatorFactory(signer: Wallet): Promise<OperatorFactory> {
        const operatorTemplateAddress = "0x699B4bE95614f017Bb622e427d3232837Cc814E6"
        // const {
        //     token, streamrConfig,
        //     defaultDelegationPolicy, defaultPoolYieldPolicy, defaultUndelegationPolicy,
        // } = contracts

        // const operatorTemplate = await (await getContractFactory("Operator", { signer })).deploy()
        const operatorFactoryFactory = new ContractFactory(operatorFactoryABI, operatorFactoryBytecode, signer)
        const operatorFactory = await operatorFactoryFactory.deploy() as unknown as OperatorFactory
        await operatorFactory.deployed()

        await (await operatorFactory.initialize(
            operatorTemplateAddress,
            config.contracts.LINK,
            config.contracts.StreamrConfig
        )).wait()

        const streamrConfigFactory = new ContractFactory(streamrConfigABI, streamrConfigBytecode, signer)
        const streamrConfig = await streamrConfigFactory.deploy() as unknown as StreamrConfig
        await streamrConfig.deployed()

        await (await streamrConfig.initialize()).wait()

        await (await streamrConfig.setSponsorshipFactory(config.contracts.SponsorshipFactory)).wait()

        await (await streamrConfig.setOperatorFactory(operatorFactory.address)).wait()

        // const streamrConfig = new Contract(config.contracts.StreamrConfig, streamrConfigABI) as unknown as StreamrConfig

        // await (await operatorFactory.initialize(
        //     operatorTemplate!.address,
        //     token!.address,
        //     streamrConfig!.address,
        //     { gasLimit: 500000 } // solcover makes the gas estimation require 1000+ ETH for transaction, this fixes it
        // )).wait()
        await (await operatorFactory.addTrustedPolicies([
            config.contracts.DefaultDelegationPolicy,
            config.contracts.DefaultPoolYieldPolicy,
            config.contracts.DefaultUndelegationPolicy
        ], { gasLimit: 500000 })).wait()

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
        await (await streamRegistry.createStream(streamPath1, "metadata")).wait()
        logger.debug(`creating stream with streamId2 ${streamId2}`)
        await (await streamRegistry.createStream(streamPath2, "metadata")).wait()
    })
    
    afterEach(async () => {
        await service.stop()
        await client?.destroy()
    })

    it("allows to flag an operator as malicious", async () => {
        const operatorFactory = await deployOperatorFactory(adminWallet)
        const newOperatorFactoryChainConfig = Chains.load()["dev1"]
        newOperatorFactoryChainConfig.contracts.OperatorFactory = operatorFactory.address
        const flagger = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch)
        logger.debug("deployed flagger contract" + flagger.operatorConfig.operatorContractAddress)
        const target = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch)
        logger.debug("deployed target contract" + target.operatorConfig.operatorContractAddress)
        const voter = await createWalletAndDeployOperator(provider, config, theGraphUrl, fetch)
        logger.debug("deployed voter contract" + voter.operatorConfig.operatorContractAddress)

        await new Promise((resolve) => setTimeout(resolve, 5000)) // wait for events to be processed
        const flaggerOperatorClient = new VoteOnSuspectNodeService(client, flagger.operatorConfig, logger)
        await flaggerOperatorClient.start()

        const targetOperatorClient = new VoteOnSuspectNodeService(client, target.operatorConfig, logger)
        await targetOperatorClient.start()

        // get all operators from theGraph

        // const voterOperatorClient = new VoteOnSuspectNodeService(client, voter.operatorConfig, logger)
        // await voterOperatorClient.start()

        // get all operator contracts
    
        // let receivedReviewRequested = false
        // voterOperatorClient.on("onReviewRequest", (targetOperator: string, sponsorship: string) => {
        //     logger.debug(`got onRviewRequested event for targetOperator ${targetOperator} with sponsorship ${sponsorship}`)
        //     receivedReviewRequested = true
        // })

        // logger.debug("deploying sponsorship contract")
        // const sponsorship = await deploySponsorship(config, adminWallet , {
        //     streamId: streamId1 })
        // logger.debug("sponsoring sponsorship contract")
        // await (await token.connect(adminWallet).approve(sponsorship.address, parseEther("500"))).wait()
        // await (await sponsorship.sponsor(parseEther("500"))).wait()

        // logger.debug("each operator delegates to its operactor contract")
        // logger.debug("delegating from flagger: ", flagger.operatorWallet.address)
        // await (await token.connect(flagger.operatorWallet).transferAndCall(flagger.operatorContract.address,
        //     parseEther("200"), flagger.operatorWallet.address)).wait()
        // logger.debug("delegating from target: ", target.operatorWallet.address)
        // await (await token.connect(target.operatorWallet).transferAndCall(target.operatorContract.address,
        //     parseEther("200"), target.operatorWallet.address)).wait()
        // logger.debug("delegating from voter: ", voter.operatorWallet.address)
        // await (await token.connect(voter.operatorWallet).transferAndCall(voter.operatorContract.address,
        //     parseEther("200"), voter.operatorWallet.address)).wait()
        
        // await new Promise((resolve) => setTimeout(resolve, 5000))

        // logger.debug("staking to sponsorship contract from flagger and target and voter")
        // logger.debug("staking from flagger: ", flagger.operatorContract.address)
        // await (await flagger.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        // logger.debug("staking from target: ", target.operatorContract.address)
        // await new Promise((resolve) => setTimeout(resolve, 3000))
        // await (await target.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        // logger.debug("staking from voter: ", voter.operatorContract.address)
        // await new Promise((resolve) => setTimeout(resolve, 3000))
        // await (await voter.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        // await new Promise((resolve) => setTimeout(resolve, 3000))
        
        // logger.debug("registering node addresses")
        // // await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()
        // const nodesettr = await (await flagger.operatorContract.setNodeAddresses([flagger.operatorWallet.address])).wait()

        // logger.debug("flagging target operator")
        // // flaggerOC -> sponsorshipC -> voterOC.emits
        // const tr = await (await flagger.operatorContract.flag(sponsorship.address, target.operatorContract.address)).wait()
        // await waitForCondition(() => receivedReviewRequested, 100000, 1000)
        
        flaggerOperatorClient.stop()
    })
})
