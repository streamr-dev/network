import { Logger, waitForCondition } from "@streamr/utils"
import { parseEther } from "ethers/lib/utils"
import StreamrClient, { CONFIG_TEST } from "streamr-client"
import { createWalletAndDeployOperator } from "./deployOperatorContract"
import { deploySponsorship } from "./deploySponsorshipContract"
import { Provider } from "@ethersproject/abstract-provider"
import { JsonRpcProvider } from "@ethersproject/providers"
// import { Chains } from "@streamr/config"
import { StreamrEnvDeployer, TestToken } from "@streamr/network-contracts"
import { Wallet } from "ethers"
import fetch from "node-fetch"
import { VoteOnSuspectNodeService } from "../../../../src/plugins/operator/VoteOnSuspectNodeService"
import { MockProxy, mock } from "jest-mock-extended"
import { VoteOnSuspectNodeHelper } from "../../../../src/plugins/operator/VoteOnSuspectNodeHelper"
import { Chain } from "@streamr/config"

// const config = Chains.load()["dev1"]
const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

jest.setTimeout(600000)

const logger = new Logger(module)
describe('MaintainTopologyService', () => {
    let provider: Provider
    let adminWallet: Wallet
    let token: TestToken
    let streamId1: string
    let streamId2: string
    let streamrEnvDeployer: StreamrEnvDeployer
    let config: Chain

    // const chainURL = config.rpcEndpoints[0].url
    const chainURL = "http://127.0.0.1:8545"
    // const chainURL = "http://10.200.10.1:8546"
    // const getOperators

    beforeAll(async () => {
        const privkey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        // const privkey = "0x2cd9855d17e01ce041953829398af7e48b24ece04ff9d0e183414de54dc52285"
        streamrEnvDeployer = new StreamrEnvDeployer(privkey, chainURL)
        await streamrEnvDeployer.deployEverything()
        const { contracts } = streamrEnvDeployer
        config = { contracts: streamrEnvDeployer.addresses } as unknown as Chain

        provider = new JsonRpcProvider(chainURL)
        logger.debug("Connected to: ", await provider.getNetwork())

        adminWallet = new Wallet(privkey, provider)
    
        // token = new Contract(contracts.DATA.address, tokenABI) as unknown as TestToken
        token = contracts.DATA as unknown as TestToken
        const timeString = (new Date()).getTime().toString()
        const streamPath1 = "/operatorclienttest-1-" + timeString
        const streamPath2 = "/operatorclienttest-2-" + timeString
        streamId1 = adminWallet.address.toLowerCase() + streamPath1
        streamId2 = adminWallet.address.toLowerCase() + streamPath2
        logger.debug(`creating stream with streamId1 ${streamId1}`)
        await (await contracts.streamRegistry.createStream(streamPath1, '{"partitions":"1"}')).wait()
        logger.debug(`creating stream with streamId2 ${streamId2}`)
        await (await contracts.streamRegistry.createStream(streamPath2, '{"partitions":"1"}')).wait()

    })
    
    it("allows to flag an operator as malicious", async () => {
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
        const balance = await token.balanceOf(flagger.operatorWallet.address)
        const allowance = await token.allowance(flagger.operatorWallet.address, sponsorship.address)
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
        // await new Promise((resolve) => setTimeout(resolve, 3000))
        await (await target.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        logger.debug("staking from voter: " + voter.operatorContract.address)
        // await new Promise((resolve) => setTimeout(resolve, 3000))
        await (await voter.operatorContract.stake(sponsorship.address, parseEther("150"))).wait()
        // await new Promise((resolve) => setTimeout(resolve, 3000))

        logger.debug("registering node addresses")
        await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()

        logger.debug("flagging target operator")
        const mockVoteOnSuspectNodeHelper = mock<VoteOnSuspectNodeHelper>()
        mockVoteOnSuspectNodeHelper.voteOnFlag.mockImplementation(async (operatorAddress, suspectAddress, flag) => {
            logger.debug("mockVoteOnSuspectNodeHelper.voteOnFlag called")
            logger.debug("operatorAddress: " + operatorAddress)
            logger.debug("suspectAddress: " + suspectAddress)
            logger.debug("flag: " + flag)
        })
        // @ts-expect-error mock
        voterVoteService.voteOnSuspectNodeHelper = mockVoteOnSuspectNodeHelper
        const tr = await (await flagger.operatorContract.flag(sponsorship.address, target.operatorContract.address)).wait()
        // check that voter votes
        await waitForCondition(async () => {
            return mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls.length > 0 &&
            mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls[0][0] === sponsorship.address &&
            mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls[0][1] === target.operatorContract.address &&
            mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls[0][2] === true
        }, 10000, 1000)
        flaggerVoteService.stop()
    })
})
