#!/usr/bin/env node
import { createClientCommand } from '../src/command'
import StreamrClient from 'streamr-client'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string, streamId: string) => {
    const stream = await client.getStream(streamId)
    await stream.addToStorageNode(storageNodeAddress)
})
    .arguments('<storageNodeAddress> <streamId>')
    .description('add stream to a storage node')
    .parseAsync()
