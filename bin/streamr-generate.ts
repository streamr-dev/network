#!/usr/bin/env node -r ts-node/register
import { Command } from 'commander';
import { generate } from '../src/generate'
import { exitWithHelpIfArgsNotBetween, createFnParseInt } from './common'
import pkg from '../package.json'

const program = new Command();
program
    .description('generate and print semi-random JSON data to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds', createFnParseInt('--rate'), 500)
    .version(pkg.version)
    .action((options: any) => {
        generate(options.rate)
    })
    .parse(process.argv)

exitWithHelpIfArgsNotBetween(program, 0, 0)