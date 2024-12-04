#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, operatorAddress: string, amountWei: number) => {
    await _operatorContractUtils.undelegate(await client.getSigner(), operatorAddress, amountWei)
})
    .arguments('<operatorAddress> <amountWei>')
    .description('undelegate funds from an operator')
    .parseAsync()
