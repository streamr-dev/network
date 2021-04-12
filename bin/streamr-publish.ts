#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import es from 'event-stream'
import { publishStream } from '../src/publish'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

const program = new Command();
program
    .usage('<streamId>')
    .description('publish to a stream by reading JSON messages from stdin line-by-line')
    .option('-k, --partition-key <string>', 'field name in each message to use for assigning the message to a stream partition')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)

// @ts-expect-error
const options = formStreamrOptionsWithEnv(program)
const ps = publishStream(program.args[0], program.partitionKey, options)
process.stdin
    .pipe(es.split())
    .pipe(ps)
    .on('error', (err: any) => {
        console.error(err)
        process.exit(1)
        // process.stdin.pipe(ps) recover pipe to continue execution
    })

