#!/usr/bin/env node
const program = require('commander')
const generate = require('../src/generate')
const { exitWitHelpIfArgsNotBetween } = require('./common')

program
    .description('generate and print semi-random JSON data to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds',(s) => parseInt(s), 500)
    .version(require('../package.json').version)
    .parse(process.argv)

exitWitHelpIfArgsNotBetween(program, 0, 0)

generate(program.rate)
