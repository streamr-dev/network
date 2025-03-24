#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient, urls: string) => {
    await client.setStorageNodeMetadata({
        urls: urls.split(',')
    })
})
    .arguments('<urls>')
    .description('register the current wallet as a storage node with the provided metadata URLs (comma-separated)')
    .parseAsync()
