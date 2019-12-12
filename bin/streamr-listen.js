#!/usr/bin/env node
const program = require('commander')
const listen = require('../src/listen')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv, createFnParseInt } = require('./common')

program
    .usage('<streamId> [apiKey]')
    .description('subscribe and listen to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', createFnParseInt('--partition'), 0)
    .option('-d, --disable-ordering', 'disable ordering of messages by OrderingUtil', false)
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 2)

const options = formStreamrOptionsWithEnv(program)
options.orderMessages = !program.disableOrdering
listen(program.args[0], program.partition, program.args[1], options)
