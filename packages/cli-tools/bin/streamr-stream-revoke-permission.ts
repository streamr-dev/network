#!/usr/bin/env node
import { Command } from 'commander'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    getStreamId
} from './common'
import pkg from '../package.json'
import { createClient } from '../src/client'

const program = new Command()
program
    .arguments('<streamId> <permissionId>')
    .description('revoke permission')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action(async (streamIdOrPath: string, permissionId: number, options: any) => {
        const client = createClient(options)
        const streamId = getStreamId(streamIdOrPath, options)!
        const stream = await client.getStream(streamId)
        stream.revokePermission(permissionId)
    })
    .parseAsync(process.argv)

exitWithHelpIfArgsNotBetween(program, 2, 2)