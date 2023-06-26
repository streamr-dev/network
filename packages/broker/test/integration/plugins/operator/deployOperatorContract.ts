// TODO: copy-paste from network-contracts, import from there?
import { Chain } from "@streamr/config"
import { Wallet, ContractReceipt, Contract, utils } from "ethers"
import { AddressZero } from "@ethersproject/constants"
import { Provider } from "@ethersproject/providers"

import { operatorABI, operatorFactoryABI } from "@streamr/network-contracts"
import type { Operator, OperatorFactory } from "@streamr/network-contracts"
import { OperatorServiceConfig } from "../../../../src/plugins/operator/OperatorPlugin"
import { generateWalletWithGasAndTokens } from "./smartContractUtils"
import { RequestInfo, RequestInit, Response } from "node-fetch"

const { parseEther } = utils

/**
 * @param deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(
    chainConfig: Chain, deployer: Wallet, {
        minOperatorStakePercent = 0,
        operatorSharePercent = 0,
        operatorMetadata = "{}",
    } = {}, poolTokenName = `Pool-${Date.now()}`): Promise<Operator> {

    const abi = operatorFactoryABI
    const operatorFactory = new Contract(chainConfig.contracts.OperatorFactory, abi, deployer) as unknown as OperatorFactory

    const contractAddress = await operatorFactory.operators(deployer.address)
    // if (await operatorFactory.operators(contractAddress) === deployer.address)) {
    if (contractAddress !== AddressZero) {
        throw new Error("Operator already has a contract")
    }
    /**
     * policies: [0] delegation, [1] yield, [2] undelegation policy
     * uint params: [0] initialMargin, [1] minimumMarginFraction, [2] yieldPolicyParam, [3] undelegationPolicyParam,
     *      [4] initialMinimumDelegationWei, [5] operatorsShareFraction
     */

    const operatorReceipt = await (await operatorFactory.deployOperator(
        [ poolTokenName, operatorMetadata ],
        [
            chainConfig.contracts.OperatorDefaultDelegationPolicy,
            chainConfig.contracts.OperatorDefaultPoolYieldPolicy,
            chainConfig.contracts.OperatorDefaultUndelegationPolicy,
        ], [
            0,
            // parseEther("1").mul(minOperatorStakePercent).div(100),
            0,
            0,
            0,
            0,
            // parseEther("1").mul(operatorSharePercent).div(100)
            parseEther("0.1")
        ]
    )).wait() as ContractReceipt // TODO: figure out why typechain types produce any from .connect, shouldn't need explicit typing here
    const newOperatorAddress = operatorReceipt.events?.find((e) => e.event === "NewOperator")?.args?.operatorContractAddress
    const newOperator = new Contract(newOperatorAddress, operatorABI, deployer) as unknown as Operator
    return newOperator
}

export async function createWalletAndDeployOperator(provider: Provider, config: Chain, theGraphUrl: string, 
    fetch: (url: RequestInfo, init?: RequestInit) => Promise<Response>): 
    Promise<{ operatorWallet: Wallet, operatorContract: Operator, operatorConfig: OperatorServiceConfig }> {
    const operatorWallet = await generateWalletWithGasAndTokens(provider, config)

    const operatorContract = await deployOperatorContract(config, operatorWallet)
    const operatorConfig = {
        operatorContractAddress: operatorContract.address,
        signer: operatorWallet,
        provider,
        theGraphUrl,
        fetch
    }
    return { operatorWallet, operatorContract, operatorConfig }
}
