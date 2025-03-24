#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient) => {
    await client.setStorageNodeMetadata(undefined)
})
    .description('unregister the current wallet as a storage node')
    .parseAsync()
