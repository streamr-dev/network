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
    await _operatorContractUtils.deploySponsorshipContract({
        streamId: toStreamID(streamId, toEthereumAddress(await client.getUserId())),
        earningsPerSecond: parseEther(options.earningsPerSecond),
        deployer: await client.getSigner(),
        minOperatorCount: options.minOperatorCount
    })
})
    .description('create sponsorship')
    .arguments('<streamId>')
    .requiredOption('-e, --earningsPerSecond <number>', 'Earnings per second')
    .requiredOption('-c, --minOperatorCount <number>', 'Minimum operator count')
    .parseAsync()
