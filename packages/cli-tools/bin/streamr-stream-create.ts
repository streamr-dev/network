#!/usr/bin/env node
import { Command } from 'commander'
import { create } from '../src/create'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
    createFnParseInt
} from './common'
import pkg from '../package.json'

const program = new Command()
program
    .arguments('<name>')
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --config <config>', 'define a configuration as JSON', (s: string) => JSON.parse(s))
    .option('-p, --partitions <count>', 'define a partition count',
        createFnParseInt('--partitions'))
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .action((name: string, options: any) => {
        const body: any = {
            name,
            description: options.description,
            config: options.config,
            partitions: options.partitions
        }
        create(body, formStreamrOptionsWithEnv(options))
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)