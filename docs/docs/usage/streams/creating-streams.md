---
sidebar_position: 2
---

# Creating streams
```ts
// Requires MATIC tokens (Polygon blockchain gas token)
const stream = await streamr.createStream({
  id: '/foo/bar',
});

console.log(stream.id); // e.g. `0x12345.../foo/bar`
```

You can also create a stream by defining the address in the provided id. Please note that the creation will only succeed if you specify the same address as provided for authentication when creating the `streamr` instance:

```ts
// Requires MATIC tokens (Polygon blockchain gas token)
const stream = await client.createStream({
  id: `${address}/foo/bar`,
});

console.log(stream.id); // e.g. `0x12345.../foo/bar`
```

:::note
The client generally supports the following **three ways of defining a stream id**:

```ts
// Stream id as a string:
const streamId = `${address}/foo/bar`;

// Stream id + partition as a string
const streamId = `${address}/foo/bar#4`;

// Stream id + partition as an object
const streamId = {
  id: `${address}/foo/bar`,
  partition: 4,
};
```
:::
