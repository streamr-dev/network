#!/usr/bin/env node
const program = require('commander')
const list = require('../src/list')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<apiKey>')
    .description('fetch a list of streams that are accessible with given key')
    .option('-s, --search [term]', 'search for term in name or description')
    .option('-o, --operation [permission]', 'filter by permission', /^(READ|WRITE|SHARE)$/i, 'READ')
    .option('--public-access', 'include publicly available streams')
    .option('--no-granted-access', 'exclude streams that user has directly granted permissions to')
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 1)

const query = {
    operation: program.operation,
    noConfig: true
}
if ("publicAccess" in program) {
    query.publicAccess = program.publicAccess
}
if ("search" in program) {
    query.search = program.search
}
if ("grantedAccess" in program) {
    query.grantedAccess = program.grantedAccess
}

const options = formStreamrOptionsWithEnv(program);
list(program.args[0], query, options)

