#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient) => {
    console.info(await client.getUserId())
})
    .description('displays your public address')
    .parseAsync()
