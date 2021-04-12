#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { show } from '../src/show'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

const program = new Command();
program
    .usage('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)

// @ts-expect-error
const options = formStreamrOptionsWithEnv(program);
show(program.args[0], program.includePermissions, options)

