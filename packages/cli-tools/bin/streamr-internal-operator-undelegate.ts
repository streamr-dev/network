#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { parseEther } from 'ethers'

createClientCommand(async (client: StreamrClient, operatorAddress: string, dataTokenAmount: string) => {
    await _operatorContractUtils.undelegate(
        await client.getSigner(),
        _operatorContractUtils.getOperatorContract(operatorAddress),
        parseEther(dataTokenAmount)
    )
})
    .description('undelegate funds from an operator')
    .arguments('<operatorAddress> <dataTokenAmount>')
    .parseAsync()
