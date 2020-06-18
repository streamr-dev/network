#!/usr/bin/env node
const program = require('commander')
const subscribe = require('../src/subscribe')
const { envOptions, authOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv, createFnParseInt } = require('./common')

program
    .usage('<streamId>')
    .description('subscribe to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
authOptions(program)
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 1)

const options = formStreamrOptionsWithEnv(program)
options.orderMessages = !program.disableOrdering
subscribe(program.args[0], program.partition, options)
