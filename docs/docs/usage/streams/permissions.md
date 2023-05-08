---
sidebar_position: 6
---

# Permissions

Stream permissioning relates to who gets to read, write and edit streams on the Network. This access control is enforced by the [on-chain stream registry](../../help/project-contracts.md). Since every permission update is a modification to the on-chain registry, it requires a small amount of `MATIC` tokens to fund the transaction.

User's are identified by their Ethereum public key address. It is these addresses that are given permission to read/write/edit streams.

:::info Good to know:

- The user that created the stream typically has all stream permissions.
- Stream permissions can be modified using the [Streamr JS client](https://www.npmjs.com/package/streamr-client) or with the [Streamr user interface](https://streamr.network/core)
:::

**Here is the full list of permissions a user may have on a stream:**

| Permission    | User can                         |
| ------------- | -------------------------------- |
| **PUBLISH**   | Publish data to a stream (write) |
| **SUBSCRIBE** | Subscribe to stream (read)       |
| **EDIT**      | Edit the stream details          |
| **DELETE**    | Delete the stream                |
| **GRANT**     | Share stream permissions         |

### Querying stream permissions

Using the Streamr JS client, the full list of permissions for a stream can be queried as follows:

```ts
const permissions = await stream.getPermissions();
```

The returned value is an array of permissions containing an item for each user, and possibly one for public permissions:

```ts
permissions = [
  { user: '0x12345...', permissions: ['subscribe', 'publish'] },
  { public: true, permissions: ['subscribe'] },
];
```

You can query the existence of a user's permission with `hasPermission()`. Usually you want to use `allowPublic: true` flag so that the existence of a public permission is also checked:

```ts
await stream.hasPermission({
    permission: StreamPermission.PUBLISH,
    user: '0x12345...',
    allowPublic: true
}
```

You can import the `StreamPermission` enum with:

```ts
const { StreamPermission } = require('streamr-client');

StreamPermission.PUBLISH;
StreamPermission.SUBSCRIBE;
StreamPermission.EDIT;
StreamPermission.DELETE;
StreamPermission.GRANT;
```

You may also use the [Streamr CLI tool to query permissions](../cli-tool#permission)

### Grant & revoke user permissions

#### Grant publish permission to a user

```ts
await stream.grantPermissions({
  user: '0x12345...',
  permissions: [StreamPermission.PUBLISH],
});
```

#### Revoke permission from a user

```ts
await stream.revokePermissions({
  user: '0x12345...',
  permissions: [StreamPermission.PUBLISH],
});
```

### Grant & revoke public permission

A stream that is publicly readable is typically referred to as a _public_ stream, but it doesn't necessasily mean its publicly writable. On the other hand, streams referred to as _private_ maintain a set of publishers and subscribers whereas public streams do not. Regardless of the type of stream, every data point pushed to a stream is always signed by the private key of the publisher.

- The `PUBLISH` and `SUBSCRIBE` stream permissions can be made _public_, meaning that anyone could `SUBSCRIBE` and/or `PUBLISH` to the stream.
- If a stream has public `SUBSCRIBE` permissions, it means that anyone can `SUBSCRIBE` to that stream.
- Public `PUBLISH` permission is typically not recommended as it means anyone could write data to your stream.

#### Grant public permission to subscribe

```ts
await stream.grantPermissions({
  public: true,
  permissions: [StreamPermission.SUBSCRIBE],
});
```

#### Revoke public permission to subscribe

```ts
await stream.revokePermissions({
  public: true,
  permissions: [StreamPermission.SUBSCRIBE],
});
```

### Set multiple permissions

The method `streamr.setPermissions` can be used to set an exact set of permissions for one or more streams. Note that if there are existing permissions for the same users in a stream, the previous permissions are overwritten. Also note that this method cannot be used on the `stream` object, but via the `StreamrClient` instance. The `StreamrClient` instance is typically named `streamr`.

```ts
await streamr.setPermissions({
    streamId,
    assignments: [
        {
            user: '0x11111...',
            permissions: [StreamPermission.EDIT]
        }, {
            user: '0x22222...'
            permissions: [StreamPermission.GRANT]
        }, {
            public: true,
            permissions: [StreamPermission.PUBLISH, StreamPermission.SUBSCRIBE]
        }
    ]
})
```
