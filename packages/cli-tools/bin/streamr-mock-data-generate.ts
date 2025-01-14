#!/usr/bin/env node
import { createFnParseInt } from '../src/common'
import { createCommand, Options as BaseOptions } from '../src/command'
import { randomString } from '@streamr/utils'
import crypto from 'crypto'

interface Options extends BaseOptions {
    rate: number
    binary: boolean
    minLength: number
    maxLength: number
}

function genArray<T>(size: number, elementFn: () => T): T[] {
    const arr = []
    for (let i = 0; i < size; ++i) {
        arr.push(elementFn())
    }
    return arr
}

export const generateJson = (): string => {
    return JSON.stringify({
        someText: randomString(64),
        aNumber: Math.random() * 10000,
        bNumber: Math.random(),
        yesOrNo: Math.random() > 0.5,
        arrayOfStrings: genArray(Math.floor(Math.random() * 20), () => randomString(8)),
        arrayOfIntegers: genArray(Math.floor(Math.random() * 10), () => Math.floor(Math.random() * 100))
    })
}

export const generateBinary = ({ minLength, maxLength }: Options): string => {
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength
    const buffer = crypto.randomBytes(length)
    return buffer.toString('hex')
}

createCommand()
    .description('generate and print semi-random JSON data or random binary data (hexadecimal) to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds', createFnParseInt('--rate'), 500)
    .option('--binary', 'generate binary data instead of JSON')
    .option(
        '--min-length <n>',
        'minimum message length in bytes (only for binary data)',
        createFnParseInt('--min-length'),
        512
    )
    .option(
        '--max-length <n>',
        'maximum message length in bytes (only for binary data)',
        createFnParseInt('--max-length'),
        4096
    )
    .action((options: Options) => {
        const generate = options.binary ? generateBinary : generateJson
        setInterval(() => {
            console.info(generate(options))
        }, options.rate)
    })
    .parse()
