#!/usr/bin/env node
const program = require('commander')
const create = require('../src/create')
const {
    envOptions,
    authOptions,
    exitWitHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
    createFnParseInt
} = require('./common')

program
    .usage('<name>')
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --config <config>', 'define a configuration as JSON', (s) => JSON.parse(s))
    .option('-p, --partitions <count>', 'define a partition count',
        createFnParseInt('--partitions'))
authOptions(program)
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 1)

const body = {
    name: program.args[0]
}
if ("description" in program) {
    body.description = program.description
}
if ("config" in program) {
    body.config = program.config
}
if ("partitions" in program) {
    body.partitions = program.partitions
}

const options = formStreamrOptionsWithEnv(program)
create(body, options)
