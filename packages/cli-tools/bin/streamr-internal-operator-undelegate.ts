#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { parseEther } from 'ethers'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, dataTokenAmount: string) => {
    await _operatorContractUtils.undelegate(
        await client.getSigner(),
        operatorContractAddress,
        parseEther(dataTokenAmount)
    )
})
    .description('undelegate funds from an operator')
    .arguments('<operatorContractAddress> <dataTokenAmount>')
    .parseAsync()
