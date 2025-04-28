#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, sponsorshipAddress: string) => {
    await _operatorContractUtils.unstake(
        await client.getSigner(),
        operatorContractAddress,
        sponsorshipAddress
    )
})
    .arguments('<operatorContractAddress> <sponsorshipAddress>')
    .description('unstake all funds from a sponsorship')
    .parseAsync()
