#!/usr/bin/env node
import StreamrClient from 'streamr-client'
import { createClientCommand } from '../src/command'

createClientCommand(async (client: StreamrClient) => {
    const token = await client.session.getSessionToken()
    console.info(token)
})
    .description('get a session token for the current user')
    .parseAsync()