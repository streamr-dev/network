#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { getOperatorContract } from '../../sdk/dist/types/src/contracts/operatorContractUtils'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, sponsorshipAddress: string, amountWei: number) => {
    const operatorContract = getOperatorContract(operatorContractAddress).connect(client.getSigner())
    await _operatorContractUtils.stake(operatorContract, sponsorshipAddress, amountWei)
})
    .arguments('<operatorContractAddress> <sponsorshipAddress> <amountWei>')
    .description('stake funds to a sponsorship')
    .parseAsync()
