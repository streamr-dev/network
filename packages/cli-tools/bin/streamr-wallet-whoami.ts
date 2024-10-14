#!/usr/bin/env node
import '../src/logLevel'

import { StreamrClient } from '@streamr/sdk'
import { createClientCommand } from '../src/command'
import { toUserId } from '@streamr/utils'

createClientCommand(async (client: StreamrClient) => {
    console.info(toUserId(await client.getUserId()))
})
    .description('displays your public address')
    .parseAsync()
