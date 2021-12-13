#!/usr/bin/env node
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .description('get a session token for the current user')
    .action(async (options: any) => {
        const client = createClient(options)
        const token = await client.session.getSessionToken()
        console.info(token)
    })
    .parseAsync()