import { Provider } from '@ethersproject/abstract-provider'
import { JsonRpcProvider } from '@ethersproject/providers'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { StreamrEnvDeployer, TestToken } from '@streamr/network-contracts'
import { waitForCondition } from '@streamr/utils'
import { Wallet } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import { mock } from 'jest-mock-extended'
import { VoteOnSuspectNodeHelper } from '../../../../src/plugins/operator/VoteOnSuspectNodeHelper'
import { VoteOnSuspectNodeService } from '../../../../src/plugins/operator/VoteOnSuspectNodeService'
import { createClient, createTestStream } from '../../../utils'
import { deploySponsorshipContract, generateWalletWithGasAndTokens, setupOperatorContract } from './contractUtils'

const TIMEOUT = 1000 * 60 * 10
const ADMIN_PRIV_KEY = CHAIN_CONFIG.dev2.adminPrivateKey

describe('VoteOnSuspectNodeService', () => {
    let provider: Provider
    let adminWallet: Wallet
    let token: TestToken
    let streamId: string
    let streamrEnvDeployer: StreamrEnvDeployer
    let chainConfig: any

    const chainURL = CHAIN_CONFIG.dev2.rpcEndpoints[0].url

    beforeAll(async () => {
        streamrEnvDeployer = new StreamrEnvDeployer(ADMIN_PRIV_KEY, chainURL)
        await streamrEnvDeployer.deployEvironment()
        const { contracts } = streamrEnvDeployer
        chainConfig = { contracts: streamrEnvDeployer.addresses } as any
        provider = new JsonRpcProvider(chainURL)
        adminWallet = new Wallet(ADMIN_PRIV_KEY, provider)
        token = contracts.DATA as unknown as TestToken
        const client = createClient(ADMIN_PRIV_KEY, { 
            contracts: { 
                streamRegistryChainAddress: chainConfig.contracts.StreamRegistry,
                streamRegistryChainRPCs: {
                    chainId: 0,  // some chain id
                    rpcs: [{
                        url: chainURL
                    }]
                }
            }
        })
        streamId = (await createTestStream(client, module)).id
        await createTestStream(client, module)
        await client.destroy()

    }, TIMEOUT)
    
    it('votes on suspected node when review requested', async () => {
        const flagger = await setupOperatorContract({ provider, chainConfig, adminKey: ADMIN_PRIV_KEY })
        const target = await setupOperatorContract({ provider, chainConfig, adminKey: ADMIN_PRIV_KEY })
        const voter = await setupOperatorContract({ provider, chainConfig, adminKey: ADMIN_PRIV_KEY })
        const sponsor = await generateWalletWithGasAndTokens(provider, chainConfig, ADMIN_PRIV_KEY)

        const sponsorship = await deploySponsorshipContract({ chainConfig, deployer: adminWallet, streamId: streamId })
        await (await token.connect(sponsor).approve(sponsorship.address, parseEther('500'))).wait()
        await (await sponsorship.connect(sponsor).sponsor(parseEther('500'))).wait()

        for (const actor of [flagger, target, voter]) {
            await (await token.connect(flagger.operatorWallet).transferAndCall(
                actor.operatorContract.address,
                parseEther('200'), 
                actor.operatorWallet.address
            )).wait()
            await (await actor.operatorContract.stake(sponsorship.address, parseEther('150'))).wait()
        }

        await (await flagger.operatorContract.setNodeAddresses([await flagger.operatorContract.owner()])).wait()

        const voterClient = createClient(voter.operatorWallet.privateKey)
        const voterVoteService = new VoteOnSuspectNodeService(voterClient, voter.operatorConfig)
        await voterVoteService.start()

        // TODO: replace mock voting with real voting down the line to make this a e2e test in the true sense
        const mockVoteOnSuspectNodeHelper = mock<VoteOnSuspectNodeHelper>()
        mockVoteOnSuspectNodeHelper.voteOnFlag.mockResolvedValue(undefined)
        // @ts-expect-error mock
        voterVoteService.voteOnSuspectNodeHelper = mockVoteOnSuspectNodeHelper
        await (await flagger.operatorContract.flag(sponsorship.address, target.operatorContract.address)).wait()
        // check that voter votes
        await waitForCondition(() => mockVoteOnSuspectNodeHelper.voteOnFlag.mock.calls.length > 0, 10000)
        expect(mockVoteOnSuspectNodeHelper.voteOnFlag).toHaveBeenCalledTimes(1)
        expect(mockVoteOnSuspectNodeHelper.voteOnFlag).toHaveBeenCalledWith(sponsorship.address, target.operatorContract.address, true)
        await voterVoteService.stop()
    }, TIMEOUT)
})
