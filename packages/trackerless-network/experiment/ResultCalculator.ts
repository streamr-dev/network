import { waitForEvent } from '@streamr/utils'
import { log } from 'console'
import fs from 'fs'
import { parse } from 'path'
const readline = require('readline')

export const joinResults = async (filePath: string): Promise<void> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sum = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const results = JSON.parse(line)
        sum += parseInt(results.results)
        numOfLines += 1
        console.log(results)
    })
    await waitForEvent(file, 'close')
    console.log('avg:', sum / numOfLines)
}

export const routingResults = async (filePath: string): Promise<void> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let rttSum = 0
    let hopSum = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        const id = parsedLine.id
        const results = JSON.parse(parsedLine.results)
        for (const result of results) {
            rttSum += result.rtt
            hopSum += result.path.length
            numOfLines += 1
        }
    })
    await waitForEvent(file, 'close')
    console.log('rtt avg:', rttSum / numOfLines)
    console.log('hop avg:', hopSum / numOfLines)
}

export const timeToDataResults = async (filePath: string): Promise<void> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sumTimeToData = 0
    let sumLayer1Join = 0
    let sumEntryPointFetch = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        const parsedResult = JSON.parse(parsedLine.results)
        sumTimeToData += parsedResult.messageReceivedTimestamp - parsedResult.startTime
        sumLayer1Join += parsedResult.layer1JoinTime
        sumEntryPointFetch += parsedResult.entryPointsFetch
        numOfLines += 1
    })
    await waitForEvent(file, 'close')
    console.log('time to data avg:', sumTimeToData / numOfLines)
    console.log('layer1 join avg:', sumLayer1Join / numOfLines)
    console.log('entry point fetch avg:', sumEntryPointFetch / numOfLines)
}

export const propagationResults = async (filePath: string): Promise<void> => {
    const file = readline.createInterface({
        input: fs.createReadStream(filePath),
        output: process.stdout,
        terminal: false
    })   
    let sumPropagationTime = 0
    let sumHops = 0
    let numOfLines = 0
    file.on('line', (line: string) => {
        const parsedLine = JSON.parse(line)
        for (const resultLine of parsedLine.results) {
            const results = JSON.parse(resultLine)
            const timeToPropagate = results.route[results.route.length - 1].time - results.route[0].time
            numOfLines += 1
            sumPropagationTime += timeToPropagate
            sumHops += results.route.length - 1
        }
        // const parsedLine = JSON.parse(line)
        // const parsedResult = JSON.parse(parsedLine.results)
        // sumTimeToData += parsedResult.messageReceivedTimestamp - parsedResult.startTime
        // sumLayer1Join += parsedResult.layer1JoinTime
        // sumEntryPointFetch += parsedResult.entryPointsFetch
        // numOfLines += 1
    })
    await waitForEvent(file, 'close')
    console.log('mean propagation time:', sumPropagationTime / numOfLines)
    console.log('mean hops:', sumHops / numOfLines)
} 
