#!/usr/bin/env node
const program = require('commander')
const show = require('../src/show')
const { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } = require('./common')

program
    .usage('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
authOptions(program)
envOptions(program)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)

const options = formStreamrOptionsWithEnv(program);
show(program.args[0], program.includePermissions, options)

