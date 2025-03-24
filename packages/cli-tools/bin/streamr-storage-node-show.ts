#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, storageNodeAddress: string) => {
    const metadata = await client.getStorageNodeMetadata(storageNodeAddress)
    console.info(JSON.stringify(metadata, null, 2))
})
    .arguments('<storageNodeAddress>')
    .description('show information about a storage node')
    .parseAsync()
