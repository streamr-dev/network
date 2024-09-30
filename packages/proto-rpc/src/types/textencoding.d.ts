/* eslint-disable no-var */
import { TextEncoder as _TextEncoder, TextDecoder as _TextDecoder } from 'node:util'

declare global {
    var TextEncoder: typeof _TextEncoder
    var TextDecoder: typeof _TextDecoder
}
