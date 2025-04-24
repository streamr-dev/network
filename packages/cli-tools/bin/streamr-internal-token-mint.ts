#!/usr/bin/env node
import '../src/logLevel'

import StreamrClient, { _operatorContractUtils } from '@streamr/sdk'
import { parseEther } from 'ethers'
import { createClientCommand } from '../src/command'

const SELF_TARGET_ADDRESS_ID = 'self'

createClientCommand(async (client: StreamrClient, targetAddress: string, dataTokenAmount: string, gasAmount?: string) => {
    if (targetAddress === SELF_TARGET_ADDRESS_ID) {
        targetAddress = await client.getUserId()
    }
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
    .description('mint test tokens and optionally transfer gas to the given Ethereum address' +
        '\n\nNote: use keyword "self" as targetAddress to mint for the authenticated user')
    .parseAsync()
