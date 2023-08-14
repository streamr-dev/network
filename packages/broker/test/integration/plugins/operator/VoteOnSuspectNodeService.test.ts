import { Logger, wait, waitForCondition } from '@streamr/utils'
import { parseEther } from 'ethers/lib/utils'
import { deploySponsorship } from './deploySponsorshipContract'
import { Provider } from '@ethersproject/abstract-provider'
import { JsonRpcProvider } from '@ethersproject/providers'
import { StreamrEnvDeployer, TestToken } from '@streamr/network-contracts'
import { Wallet } from 'ethers'
import { VoteOnSuspectNodeService } from '../../../../src/plugins/operator/VoteOnSuspectNodeService'
import { mock } from 'jest-mock-extended'
import { VoteOnSuspectNodeHelper } from '../../../../src/plugins/operator/VoteOnSuspectNodeHelper'
import { setupOperatorContract } from './setupOperatorContract'
import { createClient } from '../../../utils'

const theGraphUrl = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8000/subgraphs/name/streamr-dev/network-subgraphs`

const TIMEOUT = 1000 * 60 * 10
const ADMIN_PRIV_KEY = "0x2cd9855d17e01ce041953829398af7e48b24ece04ff9d0e183414de54dc52285" // sidechain
// const ADMIN_PRIV_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" // fastChain

const logger = new Logger(module)
describe('VoteOnSuspectNodeService', () => {
    let provider: Provider
    let adminWallet: Wallet
    let token: TestToken
    let streamId1: string
    let streamId2: string
    let streamrEnvDeployer: StreamrEnvDeployer
    let config: any

    const chainURL = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8546`

    beforeAll(async () => {
        streamrEnvDeployer = new StreamrEnvDeployer(ADMIN_PRIV_KEY, chainURL)
        await streamrEnvDeployer.deployEvironment()
        const { contracts } = streamrEnvDeployer
        config = { contracts: streamrEnvDeployer.addresses } as any

        provider = new JsonRpcProvider(chainURL)
        logger.trace('Connected', { networkInfo: await provider.getNetwork() })

        adminWallet = new Wallet(ADMIN_PRIV_KEY, provider)
    
        token = contracts.DATA as unknown as TestToken
        const timeString = (new Date()).getTime().toString()
        const streamPath1 = '/voteonsuspectnodeservicetest-1-' + timeString
        const streamPath2 = '/voteonsuspectnodeservicetest-2-' + timeString
        streamId1 = adminWallet.address.toLowerCase() + streamPath1
        streamId2 = adminWallet.address.toLowerCase() + streamPath2
        logger.trace('Create stream', { streamId1 })
        await (await contracts.streamRegistry.createStream(streamPath1, '{"partitions":"1"}')).wait()
        logger.trace('Create stream', { streamId2 })
        await (await contracts.streamRegistry.createStream(streamPath2, '{"partitions":"1"}')).wait()

    }, TIMEOUT)
    
    it('allows to flag an operator as malicious', async () => {
        const flagger = await setupOperatorContract({ provider, chainConfig: config, theGraphUrl, adminKey: ADMIN_PRIV_KEY })
        logger.trace('deployed flagger contract ' + flagger.operatorConfig.operatorContractAddress)
        const target = await setupOperatorContract({ provider, chainConfig: config, theGraphUrl, adminKey: ADMIN_PRIV_KEY })
        logger.trace('deployed target contract ' + target.operatorConfig.operatorContractAddress)
        const voter = await setupOperatorContract({ provider, chainConfig: config, theGraphUrl, adminKey: ADMIN_PRIV_KEY })
        logger.trace('deployed voter contract ' + voter.operatorConfig.operatorContractAddress)

        await wait(5000) // wait for events to be processed // wait for events to be processed
        const flaggerClient = createClient(flagger.operatorWallet.privateKey)
        const flaggerVoteService = new VoteOnSuspectNodeService(flaggerClient, flagger.operatorConfig)
        await flaggerVoteService.start()

        const targetClient = createClient(target.operatorWallet.privateKey)
        const targetVoteService = new VoteOnSuspectNodeService(targetClient, target.operatorConfig)
        await targetVoteService.start()

        const voterClient = createClient(voter.operatorWallet.privateKey)
        const voterVoteService = new VoteOnSuspectNodeService(voterClient, voter.operatorConfig)
        await voterVoteService.start()

        logger.trace('deploying sponsorship contract')
        const sponsorship = await deploySponsorship(config, adminWallet, {
            streamId: streamId1 })
        logger.trace('sponsoring sponsorship contract')
        await (await token.connect(flagger.operatorWallet).approve(sponsorship.address, parseEther('500'))).wait()
        await (await sponsorship.connect(flagger.operatorWallet).sponsor(parseEther('500'))).wait()

        logger.trace('each operator delegates to its operactor contract')
        logger.trace('delegating from flagger: ' + flagger.operatorWallet.address)
        await (await token.connect(flagger.operatorWallet).transferAndCall(flagger.operatorContract.address,
            parseEther('200'), flagger.operatorWallet.address)).wait()
        logger.trace('delegating from target: ' + target.operatorWallet.address)
        await (await token.connect(target.operatorWallet).transferAndCall(target.operatorContract.address,
            parseEther('200'), target.operatorWallet.address)).wait()
        logger.trace('delegating from voter: ' + voter.operatorWallet.address)
        await (await token.connect(voter.operatorWallet).transferAndCall(voter.operatorContract.address,
            parseEther('200'), voter.operatorWallet.address)).wait()
        
        await wait(3000) // sometimes these stake fail, possibly when they end up in the same block
        logger.trace('staking to sponsorship contract from flagger and target and voter')
        logger.trace('staking from flagger: ' + flagger.operatorContract.address)
        await (await flagger.operatorContract.stake(sponsorship.address, parseEther('150'))).wait()
        await wait(3000)
        logger.trace('staking from target: ' + target.operatorContract.address)
        await (await target.operatorContract.stake(sponsorship.address, parseEther('150'))).wait()
        await wait(3000)
        logger.trace('staking from voter: ' + voter.operatorContract.address)
        await (await voter.operatorContract.stake(sponsorship.address, parseEther('150'))).wait()

        logger.trace('registering node addresses')
        await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()

        logger.trace('flagging target operator')
        // TODO: replace mock voting with real voting down the line to make this a e2e test in the true sense
        const mockVoteOnSuspectNodeHelper = mock<VoteOnSuspectNodeHelper>()
        mockVoteOnSuspectNodeHelper.voteOnFlag.mockImplementation(async (operatorAddress, suspectAddress, flag) => {
            logger.trace('mockVoteOnSuspectNodeHelper.voteOnFlag called')
            logger.trace('operatorAddress: ' + operatorAddress)
            logger.trace('suspectAddress: ' + suspectAddress)
            logger.trace('flag: ' + flag)
        })
        // @ts-expect-error mock
        voterVoteService.voteOnSuspectNodeHelper = mockVoteOnSuspectNodeHelper
        await (await flagger.operatorContract.flag(sponsorship.address, target.operatorContract.address)).wait()
        // check that voter votes
        await waitForCondition(() => mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls.length > 0, 10000)
        expect(mockVoteOnSuspectNodeHelper.voteOnFlag).toHaveBeenCalledTimes(1)
        expect(mockVoteOnSuspectNodeHelper.voteOnFlag).toHaveBeenCalledWith(sponsorship.address, target.operatorContract.address, true)
        await flaggerVoteService.stop()
    }, TIMEOUT)
})
