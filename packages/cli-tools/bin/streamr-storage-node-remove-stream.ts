#!/usr/bin/env node
import {
    getStreamId,
} from './common'
import { createClientCommand } from '../src/command'
import StreamrClient from 'streamr-client'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string, streamIdOrPath: string, options: any) => {
    const streamId = getStreamId(streamIdOrPath, options)!
    const stream = await client.getStream(streamId)
    await stream.removeFromStorageNode(storageNodeAddress)
})
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
    .parseAsync()
