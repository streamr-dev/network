#!/usr/bin/env node
import '../src/logLevel'
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient) => {
    console.info(await client.getAddress())
})
    .description('displays your public address')
    .parseAsync()
