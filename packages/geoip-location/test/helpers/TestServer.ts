import express from 'express'
import http from 'http'
import { Logger, wait } from '@streamr/utils'
import { fetchFileToMemory } from './fetchFileToMemory'
import fs from 'fs'
import { v4 } from 'uuid'
import EventEmitter from 'eventemitter3'
import { Duplex, pipeline } from 'stream'

const logger = new Logger(module)

type ExpressType = ReturnType<typeof express>
type ServerType = ReturnType<ExpressType['listen']>

const dbUrl = 'https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/GeoLite2-City.tar.gz'
const hashUrl =
    'https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/master/redist/GeoLite2-City.mmdb.sha384'

const dbFileName = '/GeoLite2-City.tar.gz'
const hashFileName = '/GeoLite2-City.mmdb.sha384'

const CACHE_PATH = '/tmp/geoip-location-test-cache'

export interface TestServerEvents {
    closed: () => void
}

function bufferToStream(buf: Buffer) {
    const tmp = new Duplex()
    tmp.push(buf)
    tmp.push(null)
    return tmp
}

export class TestServer extends EventEmitter<TestServerEvents> {
    private server?: ServerType
    private abortController?: AbortController

    private static hashData?: Uint8Array
    private static dbData?: Uint8Array

    private static async prefetchData(): Promise<void> {
        TestServer.hashData = await fetchFileToMemory(hashUrl)

        // check if db data is already prefetched to CACHE_PATH

        if (fs.existsSync(CACHE_PATH + hashFileName) && fs.existsSync(CACHE_PATH + dbFileName)) {
            // read hash data from CACHE_PATH
            const cachedHash = fs.readFileSync(CACHE_PATH + hashFileName)

            if (cachedHash.equals(TestServer.hashData)) {
                TestServer.dbData = fs.readFileSync(CACHE_PATH + dbFileName)
                return
            }
        }

        // eslint-disable-next-line require-atomic-updates
        TestServer.dbData = await fetchFileToMemory(dbUrl)

        // save db and hash data to CACHE_PATH
        try {
            fs.mkdirSync(CACHE_PATH, { recursive: true })
        } catch {
            // ignore error when creating the cache folder
        }
        // ensure there is never an incomplete file in the fs
        const uniqueName = v4()

        fs.writeFileSync(CACHE_PATH + hashFileName + uniqueName, TestServer.hashData)
        fs.renameSync(CACHE_PATH + hashFileName + uniqueName, CACHE_PATH + hashFileName)

        fs.writeFileSync(CACHE_PATH + dbFileName + uniqueName, TestServer.dbData)
        fs.renameSync(CACHE_PATH + dbFileName + uniqueName, CACHE_PATH + dbFileName)
    }

    private async writeDataKilobytesPerSecond(
        res: http.ServerResponse,
        data: Uint8Array,
        kilobytesPerSecond?: number
    ): Promise<void> {
        let delayMilliseconds = 1

        if (kilobytesPerSecond) {
            delayMilliseconds = 1000 / kilobytesPerSecond
        }
        const chuckSize = 1024
        for (let i = 0; i < data.length && !this.abortController?.signal.aborted; i += chuckSize) {
            let end = i + chuckSize
            if (end > data.length) {
                end = data.length
            }

            res.write(data.slice(i, end))

            if (delayMilliseconds !== undefined) {
                await wait(delayMilliseconds, this.abortController?.signal)
            } else {
                await wait(0, this.abortController?.signal)
            }
        }
    }

    startServer(port: number, kiloBytesPerSecond?: number): Promise<void> {
        return new Promise((resolve, _reject) => {
            const app = express()

            app.get(dbFileName, (_req, res) => {
                if (kiloBytesPerSecond !== undefined) {
                    res.setHeader('Content-Type', 'application/gzip')
                    this.writeDataKilobytesPerSecond(res, TestServer.dbData!, kiloBytesPerSecond)
                        .then(() => {
                            res.end()
                        })
                        .catch((_err) => {
                            res.end()
                        })
                } else {
                    // send data without throttling from file
                    const readable = bufferToStream(Buffer.from(TestServer.dbData!))
                    pipeline(readable, res, (err) => {
                        if (err) {
                            logger.error('Error sending db file: ', { err })
                        }
                    })
                }
            })

            app.get(hashFileName, (_req, res) => {
                // always send hash data without throttling
                const readable = bufferToStream(Buffer.from(TestServer.hashData!))
                pipeline(readable, res, (err) => {
                    if (err) {
                        logger.error('Error sending hash file: ', { err })
                    }
                })
            })

            this.server = app.listen(port, '127.0.0.1', () => {
                logger.info('Test server is running on port ' + port)

                // The server is not really ready after listen callback, possible bug in express
                setTimeout(() => {
                    resolve()
                }, 1000)
            })
        })
    }

    async start(port: number, kiloBytesPerSecond?: number): Promise<void> {
        if (!TestServer.hashData || !TestServer.dbData) {
            await TestServer.prefetchData()
        }

        if (this.server) {
            throw new Error('Test server already running')
        }

        this.abortController = new AbortController()
        await this.startServer(port, kiloBytesPerSecond)
    }

    stop(): Promise<void> {
        return new Promise((resolve, _reject) => {
            if (this.server) {
                this.abortController!.abort()

                this.server.close((err) => {
                    if (err) {
                        logger.warn('Error closing server: ', { err })
                    }
                    this.server = undefined
                    this.emit('closed')
                    resolve()
                })
                this.server.closeAllConnections()
            } else {
                resolve()
            }
        })
    }
}
