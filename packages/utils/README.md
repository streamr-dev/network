# @streamr/utils
A collection of shared common utilities

## Table of contents
- [Install](#install)
- [Use](#use)
- [Best Practices](#best-practices)
- [Release](#release)

## Install
In your Node.js project run
```
npm install @streamr/utils
```
to add this npm package as a dependency.

## Best practices regarding `wait*` functions

It would seem like the best order in which to use the control flow utilities is something like
1. Simply await a Promise if possible & relevant
2. `waitForStreamToEnd` if dealing with ReadableStream
3. `waitForEvent` if dealing with events
4. `waitForCondition` when there is no direct handle to the async-behavior 
5. `wait` if nothing else works

### Try to avoid using `wait` when possible.

- It is prone to timing issues which leads to test flaky-ness.
- It increases test run time because we always wait for the pre-determined amount of time even if the required pre-condition has been met.
- We often have to use quite large delays to err on the side of caution, increasing test run time further.

### When using `waitForCondition` favor simple conditions
- The utility doesn't provide detailed info on what went wrong; when a condition fails, you will not have much visibility into the "why". 
- Use a simple condition for `waitForCondition` and then later on in the test function perform proper assertions using the facilities provided by your test framework.
- E.g. use `waitForCondition` to wait for an array to have elements in it. Then afterwards assert the contents of those elements.

### Other
- Usefulness of `waitForEvent` declines in the presence of multiple events from the same emitter with the same event type
    - Consider bringing in `eventsToArray` or `eventsWithArgsToArray` to help
- Notice that `waitForStreamToEnd` has two uses cases: collecting the data of a stream into an array _and_ waiting for a
stream to be closed.
    - In some use cases you may only be interested in waiting for the stream to end. You don't have to examine the
    contents of the stream.
