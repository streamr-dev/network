#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { getTestTokenContract } from '../../sdk/dist/types/src/contracts/operatorContractUtils'

createClientCommand(async (client: StreamrClient, operatorAddress: string, amountWei: number) => {
    await _operatorContractUtils.delegate(await client.getSigner(), operatorAddress, amountWei, getTestTokenContract())
})
    .arguments('<operatorAddress> <amountWei>')
    .description('delegate funds to an operator')
    .parseAsync()
