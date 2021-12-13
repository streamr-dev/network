#!/usr/bin/env node
import {
    createFnParseInt
} from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<streamId>')
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --config <config>', 'define a configuration as JSON', (s: string) => JSON.parse(s))
    .option('-p, --partitions <count>', 'define a partition count',
        createFnParseInt('--partitions'))
    .action(async (streamIdOrPath: string, options: any) => {
        const body: any = {
            id: streamIdOrPath,
            description: options.description,
            config: options.config,
            partitions: options.partitions
        }
        const client = createClient(options)
        const stream = await client.createStream(body)
        console.info(JSON.stringify(stream.toObject(), null, 2))
    })
    .parseAsync()