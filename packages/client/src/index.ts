/**
 * Streamr JavaScript Client
 *
 * @packageDocumentation
 * @module StreamrClient
 */

import { StreamrClient } from './StreamrClient'
import { StreamSortOptions } from './utils/StreamSortOptions'
import { SortDirection } from './utils/SortDirection'

export * from './exports'
export default StreamrClient
// Note awful export wrappers in exports-commonjs.js & exports-esm.mjs

const client = new StreamrClient()
const test = async () => {
    const streamsIterator = client.searchStreams('', undefined, {sortBy: StreamSortOptions.createdAt, sortDirection: SortDirection.desc})
    const streams = await streamsIterator[Symbol.asyncIterator]().next()
    console.log('streams', streams)
}
test()
