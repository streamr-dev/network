/* eslint-disable no-console */

import { spawn } from "child_process"
import { Logger } from "@streamr/utils"
import { WebSocketServer } from "../../../src/connection/WebSocket/WebSocketServer"
import { IConnection } from "../../../src/connection/IConnection"

const logger = new Logger(module)
const webSocketServer = new WebSocketServer()

//let serverWebSocket: IConnection
let timeout: NodeJS.Timeout | undefined

const run = async () => {
    await webSocketServer.start(9999)

    webSocketServer.on('connected', (serverConnection: IConnection) => {
        //serverWebSocket = serverConnection

        serverConnection.on('data', (bytes: Uint8Array) => {

            // convert bytes to javascript object
            const data = new TextDecoder().decode(bytes)
            const obj = JSON.parse(data)

            if (obj.type === "start" && !timeout) {
                timeout = setTimeout(() => {
                    timeout = undefined
                    logger.error("Joining took longer than 10 seconds, dumping heap")

                    //spawn("diat", ["cpuprofile", "-a=127.0.0.1:1220"])
                    spawn("kill", ["-s SIGINT", '' + child.pid])

                }, 10000)
            }

            if (obj.type === "end") {
                if (timeout) {
                    clearTimeout(timeout)
                    timeout = undefined
                }
            }
        })
    })

    logger.info(process.cwd())

    /*
    const child = spawn("0x" , ["--", "node", "--expose-gc", "--max-old-space-size=8096", "--inspect=1220", 
        "./dist/test/benchmark/experiments/JoiningTimeLayer0.js"], { detached: true, 
            stdio: "inherit",
            cwd: process.cwd()
        } )
    */
    const child = spawn("npx", ["nsolid ./dist/test/benchmark/experiments/JoiningTimeLayer0.js",
    ], {
        detached: true,
        stdio: "inherit",
        cwd: process.cwd()
    })

    //spawnSync("diat", ["cpuprofile", "-a=127.0.0.1:1220"], { stdio: 'inherit' })
    child.on("close", (code) => {
        logger.info(`child process exited with code ${code}`)
    })

    child.on("message", (msg) => {
        console.log(msg)
    })
}

run().then(() => {
    logger.info("Done")
}).catch((e) => {
    logger.error(e)
})
