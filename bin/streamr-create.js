#!/usr/bin/env node
const program = require('commander')
const create = require('../src/create')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<name> <apiKey>')
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --config <config>', 'define a configuration as JSON', (s) => JSON.parse(s))
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 2, 2)

const body = {
    name: program.args[0]
}
if ("description" in program) {
    body.description = program.description
}
if ("config" in program) {
    body.config = program.config
}

const options = formStreamrOptionsWithEnv(program)
create(body, program.args[1], options)

