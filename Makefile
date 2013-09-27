.PHONY: default
default: lint test

.PHONY: test
test:
	./node_modules/.bin/mocha $(shell find test -name "*_test.js")

.PHONY: lint
lint:
	gjslint  --recurse . \
		--disable "210,217,220,225,0212" \
		--exclude_directories "examples,node_modules"
