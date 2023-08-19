import { Provider } from '@ethersproject/providers'
import { Wallet } from 'ethers'

import type { Operator } from '@streamr/network-contracts'
import { EthereumAddress, toEthereumAddress } from '@streamr/utils'
import { OperatorServiceConfig } from '../../../../src/plugins/operator/OperatorPlugin'
import { deployOperatorContract } from './deployOperatorContract'
import { THE_GRAPH_URL, generateWalletWithGasAndTokens } from './smartContractUtils'

export interface SetupOperatorOpts {
    nodeAddresses?: EthereumAddress[]
    provider: Provider
    // eslint-disable-next-line max-len
    chainConfig: { contracts: { DATA: string, OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
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
        theGraphUrl: THE_GRAPH_URL
    }
    return { operatorWallet, operatorContract, operatorConfig }
}
