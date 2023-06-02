import { IERC677, Operator, Sponsorship, tokenABI } from '@streamr/network-contracts'
import { Contract } from '@ethersproject/contracts'
import { JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from 'ethers'
import { fastPrivateKey } from '@streamr/test-utils'
import { parseEther } from '@ethersproject/units'
import { deploySponsorship as _deploySponsorship } from './deploySponsorshipContract'
import { deployOperatorContract as _deployOperatorContract } from './deployOperatorContract'
import { Chains } from '@streamr/config'

const ADMIN_WALLET_PK = '0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae'
const CONFIG = Chains.load()["dev1"]

export function getProvider(): JsonRpcProvider {
    return new JsonRpcProvider(CONFIG.rpcEndpoints[0].url)
}

export function getTokenContract(): IERC677 {
    return new Contract(CONFIG.contracts.LINK, tokenABI) as unknown as IERC677
}

export async function generateWalletWithGasAndTokens(provider: JsonRpcProvider): Promise<Wallet> {
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = new Wallet(ADMIN_WALLET_PK).connect(provider)
    const token = getTokenContract().connect(adminWallet)
    await (await token.transfer(newWallet.address, parseEther("1000"))).wait()
    await (await adminWallet.sendTransaction({
        to: newWallet.address,
        value: parseEther("1")
    })).wait()
    return newWallet.connect(provider)
}

export async function deploySponsorship(streamId: string, operatorWallet: Wallet): Promise<Sponsorship> {
    return await _deploySponsorship(CONFIG, operatorWallet, { streamId })
}

export async function deployOperatorContract(operatorWallet: Wallet): Promise<Operator> {
    return await _deployOperatorContract(CONFIG, operatorWallet)
}
