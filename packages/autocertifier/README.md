# Streamr AutoCertifier

Streamr AutoCertifier is a DynDNS server that upon request by a Streamr node, allocates a random domain name for it and obtains a valid certificate from a public certificate authority that supports the ACME protocol.

## Description

To make it possble for Streamr network nodes running on browsers to join the network, 
as many Streamr Network nodes running on NodeJS as possible need to be WebSocket-connectable. Because of mixed-content restrictions on modern browsers, the Streamr Network nodes running a WebSocket server need to have a valid domain name and a certificate.

In order to make the process of setting up a WebSocket-connectable Streamr Network node easier, Streamr Autocertifier provides an automated way of obtaining a domain name and a certificate to those node-runners not willing to register their own domain name and obtain a certificate.

## Getting started

### Prerequisites

Streamr AutoCertifier needs to be run on a server that
* has a static IP address
* has incoming UDP port 53 open
* has another configurable incoming TCP port open for the REST API
* is configured as the primary DNS server of a domain at a domain provider, with DNS glue records set correctly

To run the Streamr AutoCertifier server, you need the EAB Key ID and EAB HMAC Key that allow Streamr AutoCertifier to open an  ACME account at a public certificate authority. We recommend using the Google Public CA as LetsEncrypt has very low per-domain quotas, and the terms of service of ZeroSSL explicitly forbid our use case. In order to obtain the EAB Key ID and EAB HMAC Key from Google Public CA, follow the tutorial at [https://cloud.google.com/certificate-manager/docs/public-ca-tutorial](https://cloud.google.com/certificate-manager/docs/public-ca-tutorial)

### Installation

* install the autocertifier package
```bash
npm install @streamr/autocertifier
```
* prepare a location for the data directory (eg ~/private/) that is never committed to GitHub for storing the private data of the AutoCertifier

* forward UDP port 53 to the AutoCertifier DNS server port. __Do not run AutoCertifier as root__
```bash
sudo iptables -t nat -A PREROUTING -p udp --dport 53 -j REDIRECT --to-ports 59832  
```

* set the following env variables, __Note: place the srcipt that sets these variables in a safe place, never commit it to GitHub__:

```bash
export AUTOICERTIFIER_DOMAIN_NAME="example.com"
export AUTOICERTIFIER_OWN_HOSTNAME="ns1"
export AUTOICERTIFIER_OWN_IP_ADDRESS="234.134.54.1"
export AUTOICERTIFIER_DNS_SERVER_PORT="59832"
export AUTOICERTIFIER_REST_SERVER_PORT="59833"

# The directory and the file will be created by AutoCertifier if they do not exist
export AUTOICERTIFIER_DATABASE_FILE_PATH="~/private/autocertifier.sqlite"

# The directory and the file will be created by AutoCertifier if they do not exist
export AUTOICERTIFIER_ACCOUNT_PRIVATE_KEY_PATH="~/private/autocertifier-acme-account-private-key.pem"

# This is the ACME directory URL of the ACME provider.
# The production directory for Google Public CA is https://dv.acme-v02.api.pki.goog/directory

export AUTOCERTIFIER_ACME_DIRECTORY_URL=https://dv.acme-v02.test-api.pki.goog/directory

# These are the private EAB keys obtained from the ACME provider, keep them safe!
export AUTOICERTIFIER_HMAC_KID="example-kid"
export AUTOICERTIFIER_HMAC_KEY="example-key"
```

* run the autocertifier server
```bash
npm start
```

### Testing

* run usual unit/integration tests
```bash
npm test
```

* run tests that only work on a production server that has the aforementioned prerequisites met and env variables set
```bash
npm run test-production
```
