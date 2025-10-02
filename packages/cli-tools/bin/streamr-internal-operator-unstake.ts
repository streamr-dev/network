#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { parseEther } from 'ethers'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, sponsorshipAddress: string, dataTokenAmount: string) => {
    await _operatorContractUtils.unstake(
        await client.getSigner(),
        operatorContractAddress,
        sponsorshipAddress,
        parseEther(dataTokenAmount)
    )
})
    .arguments('<operatorContractAddress> <sponsorshipAddress> <dataTokenAmount>')
    .description('unstake funds from a sponsorship')
    .parseAsync()
