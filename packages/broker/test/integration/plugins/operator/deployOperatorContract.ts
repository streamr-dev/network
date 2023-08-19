// TODO: copy-paste from network-contracts, import from there?
import { AddressZero } from '@ethersproject/constants'
import { parseEther } from '@ethersproject/units'
import type { Operator, OperatorFactory } from '@streamr/network-contracts'
import { operatorABI, operatorFactoryABI } from '@streamr/network-contracts'
import { Contract, ContractReceipt, Wallet } from 'ethers'

interface DeployOperatorContractOpts {
    // eslint-disable-next-line max-len
    chainConfig: { contracts: { OperatorFactory: string, OperatorDefaultDelegationPolicy: string, OperatorDefaultPoolYieldPolicy: string, OperatorDefaultUndelegationPolicy: string } }
    deployer: Wallet
    minOperatorStakePercent?: number
    operatorSharePercent?: number
    operatorMetadata?: string
    poolTokenName?: string 
}

/**
 * @param deployer should be the operator's Wallet
 * @returns Operator
 */
export async function deployOperatorContract(
    opts: DeployOperatorContractOpts
): Promise<Operator> {

    const abi = operatorFactoryABI
    const operatorFactory = new Contract(opts.chainConfig.contracts.OperatorFactory, abi, opts.deployer) as unknown as OperatorFactory

    const contractAddress = await operatorFactory.operators(opts.deployer.address)
    if (contractAddress !== AddressZero) {
        throw new Error('Operator already has a contract')
    }
    const operatorReceipt = await (await operatorFactory.deployOperator(
        [ opts.poolTokenName ?? `Pool-${Date.now()}`, opts.operatorMetadata ?? '{}' ],
        [
            opts.chainConfig.contracts.OperatorDefaultDelegationPolicy,
            opts.chainConfig.contracts.OperatorDefaultPoolYieldPolicy,
            opts.chainConfig.contracts.OperatorDefaultUndelegationPolicy,
        ], [
            0,
            parseEther('1').mul(opts.minOperatorStakePercent ?? 0).div(100),
            0,
            0,
            0,
            parseEther('1').mul(opts.operatorSharePercent ?? 0).div(100)
        ]
    )).wait() as ContractReceipt // TODO: figure out why typechain types produce any from .connect, shouldn't need explicit typing here
    const newOperatorAddress = operatorReceipt.events?.find((e) => e.event === 'NewOperator')?.args?.operatorContractAddress
    const newOperator = new Contract(newOperatorAddress, operatorABI, opts.deployer) as unknown as Operator
    return newOperator
}
