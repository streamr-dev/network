import StreamrClient from './StreamrClient'
import * as StreamEndpoints from './rest/StreamEndpoints'
import * as LoginEndpoints from './rest/LoginEndpoints'
import * as CommunityEndpoints from './rest/CommunityEndpoints'

// Mixin the rest endpoints to the StreamrClient
Object.assign(StreamrClient.prototype, {
    ...StreamEndpoints,
    ...LoginEndpoints,
    ...CommunityEndpoints,
})

export default StreamrClient
