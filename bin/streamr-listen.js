#!/usr/bin/env node
const program = require('commander')
const listen = require('../src/listen')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<streamId> [apiKey]')
    .description('subscribe and listen to a stream, prints JSON messages to stdout line-by-line')
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 2)

const options = formStreamrOptionsWithEnv(program)
listen(program.args[0], program.args[1], options)
