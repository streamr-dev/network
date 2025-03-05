#!/usr/bin/env node
import '../src/logLevel'

import { _operatorContractUtils } from '@streamr/sdk'
import { parseEther } from 'ethers'
import { createCommand } from '../src/command'

createCommand().action(async (targetAddress: string, dataTokenAmount: string, gasAmount?: string) => {
    const adminWallet = _operatorContractUtils.getTestAdminWallet()
    const token = _operatorContractUtils.getTestTokenContract().connect(adminWallet)
    await (await token.mint(targetAddress, parseEther(dataTokenAmount))).wait()
    if (gasAmount !== undefined) {
        await (await adminWallet.sendTransaction({
            to: targetAddress,
            value: parseEther(gasAmount)
        })).wait()
    }
})
    .arguments('<targetAddress> <dataTokenAmount> [gasAmount]')
    .description('mint test tokens and optionally transfer gas to the given Ethereum address')
    .parseAsync()
