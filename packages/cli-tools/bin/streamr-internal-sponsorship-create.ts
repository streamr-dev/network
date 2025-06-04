#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { toEthereumAddress, toStreamID } from '@streamr/utils'
import { parseEther } from 'ethers'

interface Options extends BaseOptions {
    earningsPerSecond: string
    minOperatorCount?: number
}

createClientCommand(async (client: StreamrClient, streamId: string, options: Options) => {
    const contract = await _operatorContractUtils.deploySponsorshipContract({
        streamId: toStreamID(streamId, toEthereumAddress(await client.getUserId())),
        earningsPerSecond: parseEther(options.earningsPerSecond),
        deployer: await client.getSigner(),
        minOperatorCount: options.minOperatorCount,
        environmentId: client.getConfig().environment
    })
    console.info(JSON.stringify({ address: await contract.getAddress() }, undefined, 4))
})
    .description('create sponsorship')
    .arguments('<streamId>')
    .requiredOption('-e, --earnings-per-second <number>', 'Earnings per second in data tokens')
    .option('--min-operator-count <number>', 'Minimum operator count')
    .option('--max-operator-count <number>', 'Maximum operator count')
    .parseAsync()
