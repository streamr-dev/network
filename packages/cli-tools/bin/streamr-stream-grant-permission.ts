#!/usr/bin/env node

import { Stream, StreamPermission } from 'streamr-client'
import { runModifyPermissionsCommand } from '../src/permission'

runModifyPermissionsCommand(
    (stream: Stream, permission: StreamPermission, target: string) => stream.grantUserPermission(permission, target),
    (stream: Stream, permission: StreamPermission) => stream.grantPublicPermission(permission),
    'grant'
)
