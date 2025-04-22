#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { toEthereumAddress, toStreamID } from '@streamr/utils'
import { parseEther } from 'ethers'

interface Options extends BaseOptions {
    earningsPerSecond: string
    minOperatorCount: number
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    if (client.getConfig().environment !== 'dev2') {
        // currently the deploySponsorshipContract uses TEST_CHAIN_CONFIG and therefore only "dev2" is supported
        // TODO add e.g. "environment" parameter to that function so that other environments are also supported 
        console.error('only "dev2" environment is supported')
        process.exit(1)
    }
    await _operatorContractUtils.deploySponsorshipContract({
        streamId: toStreamID(streamId, toEthereumAddress(await client.getUserId())),
        earningsPerSecond: parseEther(options.earningsPerSecond),
        deployer: await client.getSigner(),
        minOperatorCount: options.minOperatorCount
    })
})
    .description('create sponsorship')
    .arguments('<streamId>')
    .requiredOption('-e, --earnings-per-second <number>', 'Earnings per second')
    .requiredOption('-c, --min-operator-count <number>', 'Minimum operator count')
    .parseAsync()
