#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { parseEther } from 'ethers'

createClientCommand(async (client: StreamrClient, sponsorshipAddress: string, dataTokenAmount: string) => {
    await _operatorContractUtils.sponsor(
        await client.getSigner(),
        sponsorshipAddress,
        parseEther(dataTokenAmount),
        _operatorContractUtils.getTestTokenContract()
    )
})
    .description('sponsor a stream')
    .arguments('<sponsorshipAddress> <tokenAmount>')
    .parseAsync()
