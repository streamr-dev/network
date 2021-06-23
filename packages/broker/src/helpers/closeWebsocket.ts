import WebSocket from 'ws'
import { Logger } from 'streamr-network'
// @ts-expect-error no type definitions
import Cutter from 'utf8-binary-cutter'

const STATUS_UNEXPECTED_CONDITION = 1011
const MAX_ERROR_MESSAGE_LENGTH = 123 // https://html.spec.whatwg.org/multipage/web-sockets.html

export const closeWithError = (error: Error, context: string, ws: WebSocket, logger: Logger) => {
    const msg = `${context}: ${error.message}`
    logger.error(msg, error)
    ws.close(STATUS_UNEXPECTED_CONDITION, Cutter.truncateToBinarySize(msg, MAX_ERROR_MESSAGE_LENGTH))
}