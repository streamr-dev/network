import { Chain } from "@streamr/config"
import { Wallet } from "ethers"
import { Provider } from "@ethersproject/providers"

import type { Operator } from "@streamr/network-contracts"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { generateWalletWithGasAndTokens } from "./smartContractUtils"
import { toEthereumAddress } from "@streamr/utils"
import { deployOperatorContract } from "./deployOperatorContract"

export async function createWalletAndDeployOperator(provider: Provider, config: Chain, theGraphUrl: string, 
    adminKey?: string): 
    Promise<{ operatorWallet: Wallet, operatorContract: Operator, operatorConfig: OperatorServiceConfig }> {
    const operatorWallet = await generateWalletWithGasAndTokens(provider, config, adminKey)

    const operatorContract = await deployOperatorContract(config, operatorWallet)
    const operatorConfig = {
        operatorContractAddress: toEthereumAddress(operatorContract.address),
        signer: operatorWallet,
        provider,
        theGraphUrl
    }
    return { operatorWallet, operatorContract, operatorConfig }
}
