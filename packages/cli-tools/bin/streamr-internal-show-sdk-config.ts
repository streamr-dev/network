#!/usr/bin/env node
import '../src/logLevel'

import StreamrClient from '@streamr/sdk'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient) => {
    const config = client.getConfig()
    console.info(JSON.stringify(config, undefined, 4))
}).parseAsync()
