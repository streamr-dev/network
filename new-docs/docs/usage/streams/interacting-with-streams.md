---
sidebar_position: 3
---

# Interacting with streams
The `Stream` type provides a convenient way to interact with a stream without having to repeatedly pass Stream IDs.

### Getting existing streams
```ts
const stream = await streamr.getStream(streamId);
```

The method getOrCreateStream gets the stream if it exists, and if not, creates it:

```ts
// May require MATIC tokens (Polygon blockchain gas token)
const stream = await streamr.getOrCreateStream({
  id: streamId,
});
```

### Updating a stream
To update the description of a stream:

```ts
// Requires MATIC tokens (Polygon blockchain gas token)
await stream.update({
  description: 'New description',
});
```

### Deleting a stream
To delete a stream:

```ts
// Requires MATIC tokens (Polygon blockchain gas token)
await stream.delete();
```
