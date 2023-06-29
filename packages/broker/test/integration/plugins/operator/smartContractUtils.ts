import { TestToken, Operator, Sponsorship, tokenABI } from '@streamr/network-contracts'
import { Contract } from '@ethersproject/contracts'
import { Provider, JsonRpcProvider } from '@ethersproject/providers'
import { Wallet } from 'ethers'
import { fastPrivateKey } from '@streamr/test-utils'
import { parseEther } from '@ethersproject/units'
import { deploySponsorship as _deploySponsorship } from './deploySponsorshipContract'
import { deployOperatorContract as _deployOperatorContract } from './deployOperatorContract'
import { Chain, Chains } from '@streamr/config'

export const ADMIN_WALLET_PK = '0x4059de411f15511a85ce332e7a428f36492ab4e87c7830099dadbf130f1896ae'
const CONFIG = Chains.load()["dev1"]

export function getProvider(): Provider {
    return new JsonRpcProvider(CONFIG.rpcEndpoints[0].url)
}

export function getTokenContract(): TestToken {
    return new Contract(CONFIG.contracts.LINK, tokenABI) as unknown as TestToken
}

export async function generateWalletWithGasAndTokens(provider: Provider, config?: Chain, adminKey?: string): Promise<Wallet> {
    const newWallet = new Wallet(fastPrivateKey())
    const adminWallet = new Wallet(adminKey ?? ADMIN_WALLET_PK).connect(provider)

    if (config && !config.contracts.LINK) {
        const token = new Contract(config.contracts.DATA, tokenABI, adminWallet) as unknown as TestToken 
        // eslint-disable-next-line no-console
        console.log("trying data with nonce " + await adminWallet.getTransactionCount() + " time " + new Date().getTime() / 1000)
        await (await token.mint(newWallet.address, parseEther("1000000"), {
            nonce: await adminWallet.getTransactionCount()
        })).wait()
        // eslint-disable-next-line no-console
        console.log("sent Data to " + newWallet.address)
    } else {
        const token = getTokenContract().connect(adminWallet)
        for (let i = 0; i < 5; i++) {
            try {
                // eslint-disable-next-line no-console
                console.log("trying with nonce " + await adminWallet.getTransactionCount() + " time " + new Date().getTime() / 1000)
                await (await token.transfer(newWallet.address, parseEther("1000"), {
                    nonce: await adminWallet.getTransactionCount()
                })).wait()
                break
            } catch (e) {
                await new Promise((resolve) => setTimeout(resolve, 3000))
                // eslint-disable-next-line no-console
                console.log("sending link failed, retrying")
            }
        }
    }
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
