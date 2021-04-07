import StreamrClient from './index.js'
// required to get import { DataUnion } from 'streamr-client' to work
export * from './index.js'
// required to get import StreamrClient from 'streamr-client' to work
export default StreamrClient.default
// note this file is manually copied as-is into dist/src since we don't want tsc to compile it to commonjs
