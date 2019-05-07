#!/usr/bin/env node
const program = require('commander')
const show = require('../src/show')
const { envOptions, exitWitHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<streamId> [apiKey]')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 1, 2)

const options = formStreamrOptionsWithEnv(program);
show(program.args[0], program.args[1], program.includePermissions, options)

