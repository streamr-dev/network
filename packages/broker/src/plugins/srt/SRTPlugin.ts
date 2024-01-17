import { Schema } from 'ajv'
import { Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { AsyncSRT } from '@eyevinn/srt'
import { Logger } from '@streamr/utils'
import StreamrClient from 'streamr-client'

const logger = new Logger(module)

function arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const len = bytes.byteLength
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
}

export interface SRTPluginConfig {
    port: number
    payloadMetadata: boolean
    ip: string
    streamId: string
    partition: number
}

export class SRTPlugin extends Plugin<SRTPluginConfig> {
    private server: AsyncSRT = new AsyncSRT()
    private socket: number = 0 // assing random socket ?

    async start(): Promise<void> {
        logger.info(JSON.stringify(this.pluginConfig))
        this.server.on('error', async () => {
            logger.info('received error')
            await this.restartServer()
        })
        this.prepareServer()
    }

    async prepareServer(): Promise<void> {
        this.socket = await this.server.createSocket(false)
        let result = await this.server.bind(this.socket, this.pluginConfig.ip, this.pluginConfig.port) 
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

    async awaitConnections(socket: number): Promise<void> {
        logger.info('SRT plugin: awaiting incoming client connection ...')
        const fd = await this.server!.accept(socket)
        logger.info('SRT plugin: New incoming client fd:', { fd })
        // make messagePoolSize configurable parameter
        const messagePoolSize = 30
        let messagePool: Array<string> = []
        let msgCounter = 0
        
        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const chunk = await this.server.read(fd, 1316 * 8)
                if (chunk instanceof Uint8Array) {
                    const base64Chunk = arrayBufferToBase64(chunk)
                    const base64Payload = JSON.parse(JSON.stringify(base64Chunk))
                    messagePool.push(base64Payload)
                    
                    if (messagePool.length == messagePoolSize) {
                        const timestamp = Date.now()
                        const payload = { b:[0, messagePool, timestamp, msgCounter] }
                        await this.streamrClient?.publish({ id: this.pluginConfig.streamId, partition: this.pluginConfig.partition }, payload)
                        messagePool = []
                        msgCounter++
                    }
                }
            }
        } catch (error) {
            logger.info('SRT plugin', error)
            await this.restartServer()
            // close connection ?
            // restart plugin 
        }

    }

    // eslint-disable-next-line class-methods-use-this
    override getConfigSchema(): Schema {
        return PLUGIN_CONFIG_SCHEMA
    }
    
}

