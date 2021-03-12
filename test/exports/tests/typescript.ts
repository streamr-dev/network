// check ts esm works via tsc

import DefaultExport, * as NamedExports from 'streamr-client'

console.info('import DefaultExport, * as NamedExports from \'streamr-client\':', { DefaultExport, NamedExports })

const StreamrClient = DefaultExport

const auth = StreamrClient.generateEthereumAccount()
const client = new StreamrClient({
    auth,
})

console.assert(!!NamedExports.DataUnion, 'NamedExports should have DataUnion')

client.connect().then(() => {
    console.info('success')
    return client.disconnect()
})
