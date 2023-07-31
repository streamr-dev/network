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

:::note
The domain portion of the stream ID is case-insensitive and the Streamr SDK will force this portion of the stream ID to be lowercase for you.

However the path portion, i.e. anything that comes after the 0x address or ENS domain is **case-sensitive**.

For example,
```ts
0x123a/cat === 0x123A/cat
0x123a/CAT !== 0x123a/cat
```
:::
