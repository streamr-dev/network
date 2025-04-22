#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'

interface Options extends BaseOptions {
    cut: number
    redundancyFactor?: number
}

createClientCommand(async (client: StreamrClient, options: Options) => {
    const metadata = (options.redundancyFactor !== undefined) ? JSON.stringify({ redundancyFactor: options.redundancyFactor }) : ''
    await _operatorContractUtils.deployOperatorContract({
        deployer: await client.getSigner(),
        // TODO maybe we could change the operatorsCutPercentage type in _operatorContractUtils.deployOperatorContract so that the percentages
        // aren't affected by floating point numbers (now e.g. input 12.3 stores the value as 12.3000000000000016)
        operatorsCutPercentage: options.cut,
        metadata
    })
})
    .description('create operator')
    .requiredOption('-c, --cut <number>', 'Operator\'s cut in percentage')
    .option('-r, --redundancyFactor <number>', 'Redundancy factor')
    .parseAsync()
