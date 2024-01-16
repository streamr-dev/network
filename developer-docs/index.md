# Streamr Network Developer Documentation

## Coding conventions

### Immutability
Prefer immutable variables and fields over mutable ones. For example, use `const` for variables and `readonly` for
fields. Copy arrays and objects when mutating them.

### Avoid `null`, prefer `undefined`
Avoid `null`. Use `undefined` instead. At the very least avoid mixing the two in the same context / types.

### Naming counts
- Functions and methods for getting counts should be named `getFooCount`
- Variables and fields which store counts should be named `fooCount`

Examples:
- `getConnectionCount`, `neighborCount`

## Topics
- [Testing Best Practices](testing-best-practices.md)
- [Duplicate Detection in Network](algorithms/duplicate-detection.md)
- [Tracker Algorithm](algorithms/tracker-algorithm.md)
- [Old Archived Wiki (partially out-of-date)](https://github.com/streamr-dev/network/wiki)
