#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, userId: string) => {
    const contract = _operatorContractUtils.getOperatorContract(operatorContractAddress).connect(await client.getSigner())
    await (await contract.grantRole(await contract.CONTROLLER_ROLE(), userId)).wait()
})
    .description('grant controller role to a user')
    .arguments('<operatorContractAddress> <user>')
    .parseAsync()
