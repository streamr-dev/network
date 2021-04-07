##
## TEMPORARY scripts to pull remote changes into monorepo
##

# adds remote for a repo, if not already added

setup:
	$(call setupRemote,network)
	$(call setupRemote,broker)
	$(call setupRemote,cli-tools)
	$(call setupRemote,streamr-client-javascript)
	$(call setupRemote,streamr-client-protocol-js)
	$(call setupRemote,streamr-test-utils)

define setupRemote
	-(git remote get-url $1 || git remote add --no-tags -f $1 git@github.com:streamr-dev/$1.git)
endef

pull: setup
	-mkdir -p packages
	git subtree add --prefix=packages/network network master
	git subtree add --prefix=packages/broker broker master
	git subtree add --prefix=packages/cli-tools cli-tools master
	git subtree add --prefix=packages/client streamr-client-javascript master
	git subtree add --prefix=packages/protocol streamr-client-protocol-js master
	git subtree add --prefix=packages/test-utils streamr-test-utils master

.PHONY: pull setup
