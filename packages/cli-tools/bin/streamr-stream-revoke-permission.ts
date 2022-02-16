#!/usr/bin/env node
import '../src/logLevel'
import { Stream, StreamPermission } from 'streamr-client'
import { runModifyPermissionsCommand } from '../src/permission'

runModifyPermissionsCommand(
    (stream: Stream, permission: StreamPermission, target: string) => stream.revokePermissions({ permissions: [permission], user: target }),
    (stream: Stream, permission: StreamPermission) => stream.revokePermissions({ permissions: [permission], public: true }),
    'revoke'
)
