#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createFnParseInt } from '../src/common'
import { createClientCommand, Options as BaseOptions } from '../src/command'

interface Options extends BaseOptions {
    description?: string
    streamConfig?: any
    partitions?: number
}

createClientCommand(async (client: StreamrClient, streamIdOrPath: string, options: Options) => {
    const body: any = {
        id: streamIdOrPath,
        description: options.description,
        config: options.streamConfig,
        partitions: options.partitions
    }
    const stream = await client.createStream(body)
    console.info(JSON.stringify({ id: stream.id, ...(await stream.getMetadata()) }, null, 2))
})
    .arguments('<streamId>')
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --stream-config <config>', 'define a configuration as JSON', (s: string) => JSON.parse(s))
    .option('-p, --partitions <count>', 'define a partition count', createFnParseInt('--partitions'))
    .parseAsync()
