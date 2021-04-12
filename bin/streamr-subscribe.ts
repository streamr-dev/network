#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { subscribe } from '../src/subscribe'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv, createFnParseInt } from './common'
import pkg from '../package.json'

const program = new Command();
program
    .usage('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)

// @ts-expect-error
const options = formStreamrOptionsWithEnv(program)
options.orderMessages = !program.disableOrdering
subscribe(program.args[0], program.partition, options)
