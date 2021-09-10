// check ts esm works via tsc

import DefaultExport, * as NamedExports from 'streamr-client'

console.info('import DefaultExport, * as NamedExports from \'streamr-client\':', { DefaultExport, NamedExports })

const StreamrClient = DefaultExport

const auth = StreamrClient.generateEthereumAccount()
const client = new StreamrClient({
    auth,
})

 console.assert(!!NamedExports.Subscription, 'NamedExports should have Subscription')

client.connect().then(async () => {
    console.info('success')
    await client.disconnect()
    process.exit(0)
})
