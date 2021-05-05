#!/usr/bin/env node
import { Command } from 'commander';
import { show } from '../src/show'
import { envOptions, authOptions, exitWithHelpIfArgsNotBetween, formStreamrOptionsWithEnv } from './common'
import pkg from '../package.json'

const program = new Command();
program
    .arguments('<streamId>')
    .description('show detailed information about a stream')
    .option('--include-permissions', 'include list of permissions (requires SHARE permission)')
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((streamId: string, options: any) => {
        show(streamId, options.includePermissions, formStreamrOptionsWithEnv(options))
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)