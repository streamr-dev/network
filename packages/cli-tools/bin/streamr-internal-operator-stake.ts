#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { parseEther } from 'ethers'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, sponsorshipAddress: string, dataTokenAmount: string) => {
    const operatorContract = _operatorContractUtils.getOperatorContract(operatorContractAddress).connect(await client.getSigner())
    await _operatorContractUtils.stake(
        operatorContract,
        sponsorshipAddress,
        parseEther(dataTokenAmount)
    )
})
    .description('stake funds to a sponsorship')
    .arguments('<operatorContractAddress> <sponsorshipAddress> <dataTokenAmount>')
    .parseAsync()
