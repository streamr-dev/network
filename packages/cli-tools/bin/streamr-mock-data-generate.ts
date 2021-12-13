#!/usr/bin/env node
import { generate } from '../src/generate'
import { createFnParseInt } from './common'
import pkg from '../package.json'
import { createCommand } from '../src/command'

createCommand(false)
    .description('generate and print semi-random JSON data to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds', createFnParseInt('--rate'), 500)
    .version(pkg.version)
    .action((options: any) => {
        generate(options.rate)
    })
    .parse()