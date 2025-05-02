// check ts esm works via tsc

import DefaultExport, * as NamedExports from '@streamr/sdk'

console.info('import DefaultExport, * as NamedExports from \'@streamr/sdk\':', { DefaultExport, NamedExports })

const StreamrClient = DefaultExport

const client = new StreamrClient()

 console.assert(!!NamedExports.Subscription, 'NamedExports should have Subscription')

client.connect().then(async () => {
    console.info('success')
    await client.destroy()
    process.exit(0)
})
