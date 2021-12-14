#!/usr/bin/env node
import StreamrClient from 'streamr-client'
import { createFnParseInt } from '../src/common'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, streamIdOrPath: string, options: any) => {
    const body: any = {
        id: streamIdOrPath,
        description: options.description,
        config: options.config,
        partitions: options.partitions
    }
    const stream = await client.createStream(body)
    console.info(JSON.stringify(stream.toObject(), null, 2))
})
    .arguments('<streamId>')
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --config <config>', 'define a configuration as JSON', (s: string) => JSON.parse(s))
    .option('-p, --partitions <count>', 'define a partition count',
        createFnParseInt('--partitions'))
    .parseAsync()