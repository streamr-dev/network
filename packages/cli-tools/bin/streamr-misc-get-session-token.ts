#!/usr/bin/env node
import { Command } from 'commander'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
} from './common'
import pkg from '../package.json'
import { createClient } from '../src/client'

const program = new Command()
program
    .description('get a session token for the current user')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action(async (options: any) => {
        const client = createClient(options)
        try {
            console.info(await client.session.getSessionToken())
        } catch (err) {
            console.error(err)
            process.exit(1)
        }
    })
    .parseAsync(process.argv)
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })

exitWithHelpIfArgsNotBetween(program, 0, 0)
