import { TestToken, Operator, Sponsorship, tokenABI } from '@streamr/network-contracts'
import { Contract } from '@ethersproject/contracts'
import { Provider, JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from 'ethers'
import { fastPrivateKey } from '@streamr/test-utils'
import { parseEther } from '@ethersproject/units'
import { deploySponsorship as _deploySponsorship } from './deploySponsorshipContract'
import { deployOperatorContract as _deployOperatorContract } from './deployOperatorContract'
import { Chains } from '@streamr/config'

const ADMIN_WALLET_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const CONFIG = Chains.load()["dev1"]

export function getProvider(): Provider {
    return new JsonRpcProvider(CONFIG.rpcEndpoints[0].url)
}

export async function generateWalletWithGasAndTokens(config: any, provider: Provider): Promise<Wallet> {
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = new Wallet(ADMIN_WALLET_PK).connect(provider)
    const token = new Contract(config.contracts.DATA, tokenABI, adminWallet) as unknown as TestToken
    // for (let i = 0; i < 5; i++) {
    //     try {
    // eslint-disable-next-line no-console
    console.log("trying with nonce " + await adminWallet.getTransactionCount() + " time " + new Date().getTime() / 1000)
    await (await token.mint(newWallet.address, parseEther("1000000"), {
        nonce: await adminWallet.getTransactionCount()
    })).wait()
    // eslint-disable-next-line no-console
    console.log("sent link to " + newWallet.address)
    //         break
    //     } catch (e) {
    //         await new Promise((resolve) => setTimeout(resolve, 3000))
    //         // eslint-disable-next-line no-console
    //         console.log("sending link failed, retrying")
    //     }
    // }
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
