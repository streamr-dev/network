#!/usr/bin/env node
import { createClientCommand } from '../src/command'
import StreamrClient from 'streamr-client'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string, streamId: string) => {
    const stream = await client.getStream(streamId)
    await stream.removeFromStorageNode(storageNodeAddress)
})
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
    .parseAsync()
