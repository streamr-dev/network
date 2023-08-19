import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider, Provider } from '@ethersproject/providers'
import { parseEther } from '@ethersproject/units'
import { config as CHAIN_CONFIG } from '@streamr/config'
import { Operator, TestToken, tokenABI } from '@streamr/network-contracts'
import { fastPrivateKey } from '@streamr/test-utils'
import { Wallet } from 'ethers'
import { deployOperatorContract as _deployOperatorContract } from './deployOperatorContract'

const TEST_CHAIN = 'dev2'
// TODO read from config when https://github.com/streamr-dev/network-contracts/pull/604 
export const THE_GRAPH_URL = `http://${process.env.STREAMR_DOCKER_DEV_HOST ?? '10.200.10.1'}:8800/subgraphs/name/streamr-dev/network-subgraphs`

export function getProvider(): Provider {
    return new JsonRpcProvider(CHAIN_CONFIG[TEST_CHAIN].rpcEndpoints[0].url)
}

export function getTokenContract(): TestToken {
    return new Contract(CHAIN_CONFIG[TEST_CHAIN].contracts.DATA, tokenABI) as unknown as TestToken
}

export async function generateWalletWithGasAndTokens(
    provider: Provider,
    config?: { contracts: { DATA: string } },
    adminKey?: string
): Promise<Wallet> {
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = new Wallet(adminKey ?? CHAIN_CONFIG[TEST_CHAIN].adminPrivateKey).connect(provider)
    const token = (config !== undefined) 
        ? new Contract(config.contracts.DATA!, tokenABI, adminWallet) as unknown as TestToken
        : getTokenContract().connect(adminWallet)
    await (await token.mint(newWallet.address, parseEther('1000000'), {
        nonce: await adminWallet.getTransactionCount()
    })).wait()
    await (await adminWallet.sendTransaction({
        to: newWallet.address,
        value: parseEther('1')
    })).wait()
    return newWallet.connect(provider)
}

export async function deployOperatorContract(operatorWallet: Wallet): Promise<Operator> {
    return await _deployOperatorContract(CHAIN_CONFIG[TEST_CHAIN], operatorWallet)
}
