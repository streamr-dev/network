LANG = en_US.UTF-8
SHELL = /bin/bash
.SHELLFLAGS = -eu -o pipefail -c # run '/bin/bash ... -c /bin/cmd'
.DELETE_ON_ERROR:
.DEFAULT_GOAL = install

nvm_brew = /usr/local/opt/nvm/nvm.sh
ifneq ("$(wildcard $(nvm_brew))", "")
	nvm_sh = $(nvm_brew)
endif
nvm_default = $(HOME)/.nvm/nvm.sh
ifneq ("$(wildcard $(nvm_default))", "")
	nvm_sh = $(nvm_default)
endif
node_version = $(shell cat .nvmrc)
define npm
	@$(eval npm_args=$(1))
	bash -e -o pipefail -l -c "source $(nvm_sh) && nvm exec $(node_version) npm $(npm_args)"
endef

dist_dir = build/install/client_testing

node_modules: ## Run 'npm ci' if directory doesn't exist
	$(call npm, install)

gradlew = ./gradlew

$(dist_dir):
	$(gradlew) installDist

install: node_modules $(dist_dir)

run: install ## Run tests
	$(dist_dir)/bin/client_testing com.streamr.client_testing.Main \
		-s $$TEST_NAME \
		-c config/$$CONFIG_NAME.conf \
		-n $$NUM_MESSAGES

.PHONY: clean
clean: ## Remove generated files
	rm -rf \
		node_modules
	$(gradlew) clean

.PHONY: help
help: ## Show Help
	@grep -E '^[a-zA-Z0-9_\-\/]+%?:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}' | sort
