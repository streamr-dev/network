#!/usr/bin/env node
const program = require('commander')
const listen = require('../src/listen')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<streamId> [apiKey]')
    .description('subscribe and listen to a stream, prints JSON messages to stdout line-by-line')
    .option('-p, --partition [partition]', 'partition', (s) => parseInt(s), 0)
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 2)

const options = formStreamrOptionsWithEnv(program)
listen(program.args[0], program.partition, program.args[1], options)
