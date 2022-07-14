#!/usr/bin/env node
import pkg from '../package.json'
import { createFnParseInt } from '../src/common'
import { createCommand } from '../src/command'
import { randomString } from '@streamr/utils'

function genArray<T>(size: number, elementFn: () => T): T[] {
    const arr = []
    for (let i=0; i < size; ++i) {
        arr.push(elementFn())
    }
    return arr
}

export const generate = (rate: number): void => {
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

createCommand()
    .description('generate and print semi-random JSON data to stdout')
    .option('-r, --rate <n>', 'rate in milliseconds', createFnParseInt('--rate'), 500)
    .version(pkg.version)
    .action((options: any) => {
        generate(options.rate)
    })
    .parse()
