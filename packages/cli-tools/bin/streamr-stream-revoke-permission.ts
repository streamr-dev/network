#!/usr/bin/env node
import '../src/logLevel'

import { PermissionAssignment, Stream } from '@streamr/sdk'
import { runModifyPermissionsCommand } from '../src/permission'

runModifyPermissionsCommand((stream: Stream, assigment: PermissionAssignment) => stream.revokePermissions(assigment), 'revoke')
