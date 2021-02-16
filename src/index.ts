import StreamrClient from './StreamrClient'
import * as StreamEndpoints from './rest/StreamEndpoints'
import * as LoginEndpoints from './rest/LoginEndpoints'
import * as DataUnionEndpoints from './rest/DataUnionEndpoints'

// Mixin the rest endpoints to the StreamrClient
Object.assign(StreamrClient.prototype, {
    ...StreamEndpoints,
    ...LoginEndpoints,
    ...DataUnionEndpoints
})

export default StreamrClient
