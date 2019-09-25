import * as StreamEndpoints from './StreamEndpoints'
import * as LoginEndpoints from './LoginEndpoints'
import * as CommunityEndpoints from './CommunityEndpoints'

module.exports = {
    ...StreamEndpoints, ...LoginEndpoints, ...CommunityEndpoints,
}
