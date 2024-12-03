#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { getTestTokenContract } from '../../sdk/dist/types/src/contracts/operatorContractUtils'

createClientCommand(async (client: StreamrClient, sponsorshipAddress: string, amountWei: number) => {
    await _operatorContractUtils.sponsor(await client.getSigner(), sponsorshipAddress, amountWei, getTestTokenContract())
})
    .arguments('<sponsorshipAddress> <amountWei>')
    .description('sponsor a stream')
    .parseAsync()
