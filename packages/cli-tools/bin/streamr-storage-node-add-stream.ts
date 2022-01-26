#!/usr/bin/env node
import '../src/logLevel'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string, streamId: string) => {
    const stream = await client.getStream(streamId)
    await stream.addToStorageNode(storageNodeAddress)
})
    .arguments('<storageNodeAddress> <streamId>')
    .description('add stream to a storage node')
    .parseAsync()
