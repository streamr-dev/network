#!/usr/bin/env node
import { createFnParseInt } from '../src/common'
import { createCommand, Options as BaseOptions } from '../src/command'
import crypto from 'crypto'

interface Options extends BaseOptions {
    rate: number
    minLength: number
    maxLength: number
}

export const generateBinary = (rate: number, minLength: number, maxLength: number): void => {
    setInterval(() => {
        const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength
        const buffer = crypto.randomBytes(length)
        console.info(buffer.toString('hex'))
    }, rate)
}

createCommand()
    .description('generate and print random binary data (hexadecimal) to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds', createFnParseInt('--rate'), 500)
    .option('--min-length <n>', 'minimum message length in bytes', createFnParseInt('--min-length'), 32)
    .option('--max-length <n>', 'maximum message length in bytes', createFnParseInt('--max-length'), 64)
    .action((options: Options) => {
        generateBinary(options.rate, options.minLength, options.maxLength)
    })
    .parse()
