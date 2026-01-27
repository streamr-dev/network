// check ts esm works via tsc

import { StreamrClient, Subscription } from '@streamr/sdk'

console.info('import { StreamrClient, Subscription } from \'@streamr/sdk\':', { StreamrClient, Subscription })

console.assert(!!Subscription, 'Named exports should have Subscription')

const client = new StreamrClient()

client.connect().then(async () => {
    console.info('success')
    await client.destroy()
    process.exit(0)
})
