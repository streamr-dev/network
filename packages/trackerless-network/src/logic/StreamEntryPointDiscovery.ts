import { createHash } from 'crypto'

export const streamPartIdToDataKey = (streamPartId: string): Uint8Array => {
    return new Uint8Array(createHash('md5').update(streamPartId).digest())
}
//
// export class StreamEntryPointDiscovery {
//     constructor() {
//
//     }
// }
