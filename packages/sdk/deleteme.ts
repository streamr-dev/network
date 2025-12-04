// how to run: npm run build && LOG_LEVEL=debug npx tsx deleteme.ts

import { ProxyDirection } from './dist/src/exports.js';
import StreamrClient from './dist/src/index.js'

const client = new StreamrClient()

;(async () => {

    const streamDefinition = {
        streamId: 'binance-streamr.eth/DATAUSDT/ticker',
        partition: 0
    }
    const proxyNodes = await client.findProxyNodes(
        streamDefinition, 
        4, // number of proxies to find
    )
    console.log(proxyNodes)
    await client.setProxies(streamDefinition, proxyNodes, ProxyDirection.SUBSCRIBE)

    const subscription = await client.subscribe(streamDefinition, (msg) => console.log(msg))
})();
