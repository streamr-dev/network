#!/usr/bin/env node
import { Command } from 'commander'
import es from 'event-stream'
import { publishStream } from '../src/publish'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

const program = new Command()
program
    .arguments('<streamId>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line')
    .option('-k, --partition-key <string>', 'field name in each message to use for assigning the message to a stream partition')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((streamId: string, options: any) => {
        const ps = publishStream(streamId, options.partitionKey, formStreamrOptionsWithEnv(options))
        process.stdin
            .pipe(es.split())
            .pipe(ps)
            .on('error', (err: any) => {
                console.error(err)
                process.exit(1)
                // process.stdin.pipe(ps) recover pipe to continue execution
            })
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)