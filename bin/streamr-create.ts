#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { create } from '../src/create'
import {
    envOptions,
    authOptions,
    exitWithHelpIfArgsNotBetween,
    formStreamrOptionsWithEnv,
    createFnParseInt
} from './common'
import pkg from '../package.json'

const program = new Command();
program
    .usage('<name>')
    .storeOptionsAsProperties(true) // override name clash issue in Commander (https://git.io/JJc0W)
    .description('create a new stream')
    .option('-d, --description <description>', 'define a description')
    .option('-c, --config <config>', 'define a configuration as JSON', (s: string) => JSON.parse(s))
    .option('-p, --partitions <count>', 'define a partition count',
        createFnParseInt('--partitions'))
authOptions(program)
envOptions(program)
    .version(pkg.version)
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 1, 1)

const body: any = {
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

// @ts-expect-error
const options = formStreamrOptionsWithEnv(program)
create(body, options)
