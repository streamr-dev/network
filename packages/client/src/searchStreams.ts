/* eslint-disable padding-line-between-statements */
import { EthereumAddress} from 'streamr-client-protocol'
import { StreamPermission } from './Stream'

export interface SearchStreamsPermissionFilter {
    user: EthereumAddress
    /*
     * If possible, prefer allOf to anyOf because the query performance is better
     */
    allOf?: StreamPermission[]
    anyOf?: StreamPermission[]
    allowPublic: boolean
}