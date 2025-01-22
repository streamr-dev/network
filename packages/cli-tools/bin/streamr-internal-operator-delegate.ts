#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { parseEther } from 'ethers'

createClientCommand(async (client: StreamrClient, operatorAddress: string, dataTokenAmount: string) => {
    await _operatorContractUtils.delegate(
        await client.getSigner(),
        operatorAddress,
        parseEther(dataTokenAmount),
        _operatorContractUtils.getTestTokenContract()
    )
})
    .description('delegate funds to an operator')
    .arguments('<operatorAddress> <dataTokenAmount>')
    .parseAsync()
