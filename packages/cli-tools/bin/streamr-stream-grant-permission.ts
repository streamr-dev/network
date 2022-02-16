#!/usr/bin/env node
import '../src/logLevel'
import { Stream, StreamPermission } from 'streamr-client'
import { runModifyPermissionsCommand } from '../src/permission'

runModifyPermissionsCommand(
    (stream: Stream, permission: StreamPermission, target: string) => stream.grantPermissions({ permissions: [permission], user: target }),
    (stream: Stream, permission: StreamPermission) => stream.grantPermissions({ permissions: [permission], public: true }),
    'grant'
)
