#!/usr/bin/env node
import {
    getStreamId,
} from './common'
import { createClientCommand } from '../src/command'
import StreamrClient from 'streamr-client'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string, streamIdOrPath: string, options: any) => {
    const streamId = getStreamId(streamIdOrPath, options)!
    const stream = await client.getStream(streamId)
    await stream.addToStorageNode(storageNodeAddress)
})
    .arguments('<storageNodeAddress> <streamId>')
    .description('add stream to a storage node')
    .parseAsync()
