<p align="center">
  <a href="https://streamr.network">
    <img alt="Streamr" src="https://raw.githubusercontent.com/streamr-dev/network-monorepo/main/packages/client/readme-header.png" width="1320" />
  </a>
</p>

# @streamr/network-tracker

The repository for running a Tracker for the Streamr Network's Brubeck network.

## Install

### NPM

```bash
npm i -g @streamr/network-tracker
```

### Docker

```bash
docker pull streamr/tracker
```

## Development

```bash
git clone https://github.com/streamr-dev/network-monorepo.git
npm ci
cd packages/network-tracker
```

## Testing

```bash
# unit tests
npm run test-unit
# integration tests
npm run test-integration
# run all
npm run test
```

### Network Tests
It is recommended to build and run the tests in the network package when doing changes to the Tracker.

```bash
# In Monorepo Root
npm run build
cd packages/network
npm run test
```
