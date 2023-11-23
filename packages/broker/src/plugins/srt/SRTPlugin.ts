import { Schema } from "ajv"
import { ApiPluginConfig, Plugin } from '../../Plugin'
import PLUGIN_CONFIG_SCHEMA from './config.schema.json'
import { SRT, AsyncSRT, SRTReadStream } from "@eyevinn/srt"
import { Logger } from '@streamr/utils'
import StreamrClient from "streamr-client"

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
        //console.log('listen() result:', result)
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
        // console.log('Awaiting incoming client connection ...')
        logger.info('SRT plugin: awaiting incoming client connection ...')
        const fd = await this.server!.accept(socket)
        logger.info('SRT plugin: New incoming client fd:', { fd })
        
        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const chunk = await this.server.read(fd, 1316 * 16)
                if (chunk instanceof Uint8Array) {
                    const base64Chunk = arrayBufferToBase64(chunk)
                    const base64Payload = JSON.parse(JSON.stringify(base64Chunk))
                    const payload = { b:[0, base64Payload] }
                    const resp = await this.streamrClient?.publish(this.pluginConfig.streamId, payload)
                    //console.log(JSON.stringify(resp))
                    // logger.info(JSON.stringify(resp))
                    // "0x82a31ab84fd2159b54f887d4d8e46a0a1f3a7ffc/mapmetrics"
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

