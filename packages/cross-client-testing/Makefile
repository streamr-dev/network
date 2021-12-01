LANG = en_US.UTF-8
SHELL = /bin/bash
.SHELLFLAGS = -eu -o pipefail -c # run '/bin/bash ... -c /bin/cmd'
.DELETE_ON_ERROR:
.DEFAULT_GOAL = install
FORCE: ;

SRCS := $(shell find src -type f -name '*.java')

dist_dir = build/install/client_testing

all: install

gradlew = ./gradlew

# rebuild each time
# is reasonably fast as it doesn't rebuild unnecessarily
$(dist_dir): FORCE
	$(gradlew) installDist

install: $(dist_dir) build

run: install ## Run tests
	$(dist_dir)/bin/client_testing com.streamr.client_testing.Main \
		-s $$TEST_NAME \
		-c config/$$CONFIG_NAME.conf \
		-n $$NUM_MESSAGES

.PHONY: clean install

clean: ## Remove generated files
	$(gradlew) clean

.PHONY: help install
help: ## Show Help
	@grep -E '^[a-zA-Z0-9_\-\/]+%?:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-20s %s\n", $$1, $$2}' | sort
