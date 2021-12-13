#!/usr/bin/env node
import { createClient } from '../src/client'
import { createCommand } from '../src/command'

createCommand()
    .description('get a session token for the current user')
    .action(async (options: any) => {
        const client = createClient(options)
        try {
            console.info(await client.session.getSessionToken())
        } catch (err) {
            console.error(err)
            process.exit(1)
        }
    })
    .parseAsync()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })