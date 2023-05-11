---
sidebar_position: 1
---

# What are streams
A stream is simply a **sequence of data points in time**, i.e. an append only log. This is semantically equivalent to _topics_ in traditional pub/sub networks.

:::tip Stream properties:
- Sequence of data points in time
- Any kind of real-time data can be stored in it
- The data will always be retrieved in the correct order
- Identified by unique stream IDs
:::

Let's say you have a temperature measurement device that publishes the temperature of your house every second. Then this is how your stream would look like:

| Timestamp               | Temperature |
| :---------------------- | :---------- |
| 2019-08-01 11:30:01.012 | 312.56      |
| 2019-08-01 11:30:02.239 | 312.49      |
| 2019-08-01 11:30:03.105 | 312.42      |
| 2019-08-01 11:30:04.122 | 312.64      |
| 2019-08-01 11:30:05.882 | 312.32      |

Your stream would grow over time and you can add more colums/data fields to your timestamp.

:::tip Good to know:
[Learn more about pub/sub networking](../../help/pub-sub.md)
:::