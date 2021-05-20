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
	$(call setupRemote,streamr-client-testing)

define setupRemote
	-(git remote get-url $1 || git remote add --no-tags -f $1 git@github.com:streamr-dev/$1.git)
endef

pull: setup
	-mkdir -p packages
	git subtree pull --prefix=packages/network network master
	git subtree pull --prefix=packages/broker broker master
	git subtree pull --prefix=packages/cli-tools cli-tools master
	git subtree pull --prefix=packages/client streamr-client-javascript master
	git subtree pull --prefix=packages/protocol streamr-client-protocol-js master
	git subtree pull --prefix=packages/test-utils streamr-test-utils master
	git subtree pull --prefix=packages/cross-client-testing streamr-client-testing master

.PHONY: pull setup
