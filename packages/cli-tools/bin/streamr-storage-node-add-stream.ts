#!/usr/bin/env node
import {
    getStreamId,
} from './common'
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .arguments('<storageNodeAddress> <streamId>')
    .description('add stream to a storage node')
    .action(async (storageNodeAddress: string, streamIdOrPath: string, options: any) => {
        const client = createClient(options)
        const streamId = getStreamId(streamIdOrPath, options)!
        const stream = await client.getStream(streamId)
        await stream.addToStorageNode(storageNodeAddress)
    })
    .parseAsync()
