#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string, streamId: string) => {
    const stream = await client.getStream(streamId)
    await stream.removeFromStorageNode(storageNodeAddress)
})
    .arguments('<storageNodeAddress> <streamId>')
    .description('remove stream from a storage node')
    .parseAsync()
