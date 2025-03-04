// ESM EntryPoint
export * from './index.js'
// required to get import StreamrClient from '@streamr/sdk' to work
export { StreamrClient as default } from './index.js'
// note this file is manually copied as-is into dist/src since we don't want tsc to compile it to commonjs
