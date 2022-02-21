import { Contract } from '@ethersproject/contracts'
import { Wallet } from '@ethersproject/wallet'

import { getRandomClient, createMockAddress } from '../../test-utils/utils'
import * as Token from '../../../contracts/TestToken.json'
import { tokenAdminPrivateKey, tokenMediatorAddress } from '../devEnvironment'
import { ConfigTest } from '../../../src/ConfigTest'
import { BigNumber, providers } from 'ethers'
import { parseEther } from 'ethers/lib/utils'
import { EthereumAddress } from 'streamr-client-protocol'
import { until } from '../../../src/utils'
import debug from 'debug'
import StreamrClient from '../../../src'

const providerMainnet = new providers.JsonRpcProvider(ConfigTest.mainChainRPC)
const providerSidechain = new providers.JsonRpcProvider(ConfigTest.dataUnionChainRPC)
const tokenAdminMainnetWallet = new Wallet(tokenAdminPrivateKey, providerMainnet)
const tokenAdminSidechainWallet = new Wallet(tokenAdminPrivateKey, providerSidechain)
const tokenMainnet = new Contract(ConfigTest.tokenAddress, Token.abi, tokenAdminMainnetWallet)
const tokenSidechain = new Contract(ConfigTest.tokenSidechainAddress, Token.abi, tokenAdminSidechainWallet)

const log = debug('StreamrClient::test::token-balance')

const sendTokensToSidechain = async (receiverAddress: EthereumAddress, amount: BigNumber) => {
    const relayTokensAbi = [
        {
            inputs: [
                {
                    internalType: 'address',
                    name: 'token',
                    type: 'address'
                },
                {
                    internalType: 'address',
                    name: '_receiver',
                    type: 'address'
                },
                {
                    internalType: 'uint256',
                    name: '_value',
                    type: 'uint256'
                },
                {
                    internalType: 'bytes',
                    name: '_data',
                    type: 'bytes'
                }
            ],
            name: 'relayTokensAndCall',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function'
        }
    ]
    const tokenMediator = new Contract(tokenMediatorAddress, relayTokensAbi, tokenAdminMainnetWallet)
    const tx1 = await tokenMainnet.approve(tokenMediator.address, amount)
    await tx1.wait()
    log('Approved')
    const tx2 = await tokenMediator.relayTokensAndCall(tokenMainnet.address, receiverAddress, amount, '0x1234') // dummy 0x1234
    await tx2.wait()
    log('Relayed tokens')
    await until(async () => !(await tokenSidechain.balanceOf(receiverAddress)).eq('0'), 300000, 3000)
    log('Sidechain balance changed')
}

describe('Token', () => {
    let client: StreamrClient

    beforeAll(async () => {
        client = getRandomClient()
    })

    it('getTokenBalance', async () => {
        const userWallet = new Wallet(createMockAddress())
        const tx1 = await tokenMainnet.mint(userWallet.address, parseEther('123'))
        await tx1.wait()
        const balance = await client.getTokenBalance(userWallet.address)
        expect(balance.toString()).toBe('123000000000000000000')
    })

    it('getSidechainBalance', async () => {
        const amount = parseEther('456')
        const tx1 = await tokenMainnet.mint(tokenAdminMainnetWallet.address, amount)
        await tx1.wait()
        const userWallet = new Wallet(createMockAddress(), providerSidechain)
        await sendTokensToSidechain(userWallet.address, amount)
        const balance = await client.getSidechainTokenBalance(userWallet.address)
        expect(balance.toString()).toBe('456000000000000000000')
    }, 160000)
})
