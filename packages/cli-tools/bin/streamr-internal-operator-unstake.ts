#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, operatorAddress: string, sponsorshipAddress: string) => {
    await _operatorContractUtils.unstake(
        await client.getSigner(),
        operatorAddress,
        sponsorshipAddress
    )
})
    .arguments('<operatorAddress> <sponsorshipAddress>')
    .description('unstake all funds from a sponsorship')
    .parseAsync()
