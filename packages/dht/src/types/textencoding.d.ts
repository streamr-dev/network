import { TextEncoder as _TextEncoder } from "node:util"
import { TextDecoder as _TextDecoder } from "node:util"

declare global {
    const TextEncoder: typeof _TextEncoder
    const TextDecoder: typeof _TextDecoder
}
