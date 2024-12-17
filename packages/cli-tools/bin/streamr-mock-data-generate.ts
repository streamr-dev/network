#!/usr/bin/env node
import { createFnParseInt } from '../src/common'
import { createCommand, Options as BaseOptions } from '../src/command'
import { randomString } from '@streamr/utils'
import crypto from 'crypto'

interface Options extends BaseOptions {
    rate: number
    binary: boolean
    minLength?: number
    maxLength?: number
}

function genArray<T>(size: number, elementFn: () => T): T[] {
    const arr = []
    for (let i = 0; i < size; ++i) {
        arr.push(elementFn())
    }
    return arr
}

export const generateJson = (rate: number): void => {
    setInterval(() => {
        console.info(JSON.stringify({
            someText: randomString(64),
            aNumber: Math.random() * 10000,
            bNumber: Math.random(),
            yesOrNo: Math.random() > 0.5,
            arrayOfStrings: genArray(Math.floor(Math.random() * 20), () => randomString(8)),
            arrayOfIntegers: genArray(Math.floor(Math.random() * 10), () => Math.floor(Math.random() * 100))
        }))
    }, rate)
}

export const generateBinary = (rate: number, minLength: number, maxLength: number): void => {
    setInterval(() => {
        const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength
        const buffer = crypto.randomBytes(length)
        console.info(buffer.toString('hex'))
    }, rate)
}

createCommand()
    .description('generate and print semi-random JSON data or random binary data (hexadecimal) to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds', createFnParseInt('--rate'), 500)
    .option('--binary', 'generate binary data instead of JSON')
    .option('--min-length <n>', 'minimum message length in bytes', createFnParseInt('--min-length'), 32)
    .option('--max-length <n>', 'maximum message length in bytes', createFnParseInt('--max-length'), 64)
    .action((options: Options) => {
        if (options.binary) {
            generateBinary(options.rate, options.minLength!, options.maxLength!)
        } else {
            generateJson(options.rate)
        }
    })
    .parse()
