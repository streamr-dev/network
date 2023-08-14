import { Wallet } from "ethers"
import { Provider } from "@ethersproject/providers"

import type { Operator } from "@streamr/network-contracts"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { generateWalletWithGasAndTokens } from "./smartContractUtils"
import { EthereumAddress, toEthereumAddress } from "@streamr/utils"
import { deployOperatorContract } from "./deployOperatorContract"

export interface SetupOperatorOpts {
    nodeAddresses?: EthereumAddress[]
    provider: Provider
    // eslint-disable-next-line max-len
    chainConfig: { contracts: { DATA?: string, LINK?: string, OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
    theGraphUrl: string
    adminKey?: string
}

export async function setupOperatorContract(
    opts: SetupOperatorOpts
): Promise<{ operatorWallet: Wallet, operatorContract: Operator, operatorConfig: OperatorServiceConfig }> {
    const operatorWallet = await generateWalletWithGasAndTokens(opts.provider, opts.chainConfig, opts.adminKey)

    const operatorContract = await deployOperatorContract(opts.chainConfig, operatorWallet)
    const operatorConfig = {
        operatorContractAddress: toEthereumAddress(operatorContract.address),
        signer: operatorWallet,
        provider: opts.provider,
        theGraphUrl: opts.theGraphUrl
    }
    return { operatorWallet, operatorContract, operatorConfig }
}
