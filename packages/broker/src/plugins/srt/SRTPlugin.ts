import { Schema } from 'ajv'
import { ApiPluginConfig, Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { AsyncSRT } from '@eyevinn/srt'
import { Logger } from '@streamr/utils'
import StreamrClient from '@streamr/sdk'
import fetch from 'node-fetch';
import * as _ from "lodash";

const logger = new Logger(module)

function calculateMean(arr: number[]): number {
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return sum / arr.length;
}

function calculateStandardDeviation(arr: number[], mean: number): number {
    const squaredDiffs = arr.map(val => Math.pow(val - mean, 2));
    const meanOfSquaredDiffs = calculateMean(squaredDiffs);
    return Math.sqrt(meanOfSquaredDiffs);
}

function removeOutliers(arr: number[], threshold: number = 2): number[] {
    const mean = calculateMean(arr);
    const standardDeviation = calculateStandardDeviation(arr, mean);

    return arr.filter(val => {
        const diff = Math.abs(val - mean);
        return diff <= threshold * standardDeviation;
    });
}

function arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

function numToUint8Array(num: number): Uint8Array {
    let arr = new Uint8Array(8);
  
    for (let i = 0; i < 8; i++) {
      arr[i] = num % 256;
      num = Math.floor(num / 256);
    }
  
    return arr;
  }
  
  function uint8ArrayToNum(arr: Uint8Array): number {
    let num = 0;
  
    for (let i = 0; i < 8; i++) {
      num += Math.pow(256, i) * arr[i];
    }
  
    return num;
  }

export interface SRTPluginConfig {
    port: number
    payloadMetadata: boolean
    ip: string
    streamId: string
    partition: number,
    maxPayloadChunks: number
}

export class SRTPlugin extends Plugin<SRTPluginConfig> {
    private server: AsyncSRT = new AsyncSRT()
    private socket: number = 0 // assing random socket ?
    private streamrClient?: StreamrClient

    async start(streamrClient: StreamrClient): Promise<void> {
        this.streamrClient = streamrClient
        logger.info(JSON.stringify(this.pluginConfig))
        this.server.on('error', async (err: any) => {
            logger.info('received error')
            await this.restartServer()
        })
        this.prepareServer()
    }

    async prepareServer(): Promise<void> {
        this.socket = await this.server.createSocket(false)
        let result = await this.server.bind(this.socket, this.pluginConfig.ip, this.pluginConfig.port) // replace with config values
        result = await this.server.listen(this.socket, 2)
        logger.info('listen() result:', { result })
        this.awaitConnections(this.socket)
    }
    
    async stop(): Promise<void> {
        this.server!.close(this.socket)
    }

    async restartServer(): Promise<void> {
        logger.info('Restarting SRT plugin')
        await this.stop()
        await this.prepareServer()
    }

    async measureRequestTime(url: string): Promise<any> {
        const startTime = new Date().getTime() // Record start time
            try {
                //send t0
                const response = await fetch(url+encodeURIComponent(startTime)); // Make the request
                const t3 = new Date().getTime(); // Record end time after the request completes
                //var nowTimeStamp = new Date().getTime();
                const data = await response.json();
                //response sent
                const t2 = data.sent
                //received t1-t0 as diff
                var serverClientRequestDiffTime = data.diff
                // NTP 
                var clockOffset = (serverClientRequestDiffTime + t2 - t3)/2;
                return clockOffset
            } catch (error) {
                console.error('Request failed:', error);
            }
    }

    async estimateTimeDiff(): Promise<any> {
        const timeUrl = "http://api.streamr.space/time?time="
        let measurements = []
        let offSet = 0
        for (let i = 0; i < 20; i++) {
            const result = await this.measureRequestTime(timeUrl)
            offSet = result
            measurements.push(result)
        }
        logger.info('Time measurements', {measurements})
        const outliersRemoved = removeOutliers(measurements)
        const clockDifference = _.mean(outliersRemoved)
        logger.info('Time measurements w/o outliers', {outliersRemoved})
        return clockDifference
    }
    
    //Todo: add time stamp and msg number to payload package as bytedata

    async awaitConnections(socket: number): Promise<void> {
        
        const clockDifference = _.round(await this.estimateTimeDiff(),1)
        logger.info('SRT plugin: time difference between external clock and local system clock was: ', {clockDifference})
        logger.info('SRT plugin: awaiting incoming client connection ...')
        const fd = await this.server!.accept(socket)
        logger.info('SRT plugin: New incoming client fd:', { fd })

        try {
            let chunks = []
            let i = 0
            let msgCounter = 0
            const maxPayloadChunks = this.pluginConfig.maxPayloadChunks // < 5 unsafe, > 10 starts to add latency 

            while (true) {
                const chunk = await this.server.read(fd, 1316) // Default SRT packet length is 1316 bytes
                
                if (chunk instanceof Uint8Array && i < maxPayloadChunks) {
                    chunks.push(chunk)
                    i++
                }
        
                if (i >= maxPayloadChunks) {
                    const timestamp = Date.now()
                    const adjustedTime = timestamp + clockDifference; 
                    chunks.push(numToUint8Array(adjustedTime))  //second last 8 bytes, timestamp
                    chunks.push(numToUint8Array(msgCounter))    //last 8 bytes, msg number
                    const concatenatedChunks = concatenateUint8Arrays(chunks);
                    
                    console.log('Concatenated Data Length in Kb:', concatenatedChunks.length / 1024);
                    await this.streamrClient?.publish({ id: this.pluginConfig.streamId, partition: this.pluginConfig.partition }, concatenatedChunks)
                    i = 0
                    chunks = []
                    msgCounter++
                }
            }
        } catch (error) {
            console.error('Error reading data:', error);
            logger.info('SRT plugin', error)
            await this.restartServer()
        }
        
        function concatenateUint8Arrays(chunks: Uint8Array[]): Uint8Array {
            let totalLength = chunks.reduce((acc: number, val: Uint8Array) => acc + val.length, 0)
            let result = new Uint8Array(totalLength)
            let offset = 0

            // Copy each Uint8Array chunk into the result array at the appropriate offset
            for (let chunk of chunks) {
                result.set(chunk, offset)
                offset += chunk.length
            }

            return result
        }
    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
}