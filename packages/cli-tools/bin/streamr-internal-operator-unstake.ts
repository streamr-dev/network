#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { getOperatorContract } from '../../sdk/dist/types/src/contracts/operatorContractUtils'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, sponsorshipAddress: string) => {
    const operatorContract = getOperatorContract(operatorContractAddress).connect(client.getSigner())
    await _operatorContractUtils.unstake(operatorContract, sponsorshipAddress)
})
    .arguments('<operatorContractAddress> <sponsorshipAddress>')
    .description('unstake all funds from a sponsorship')
    .parseAsync()
