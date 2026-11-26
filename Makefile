IMAGE ?= sunset-race
PORT ?= 8080

.PHONY: install dev build preview lint typecheck test coverage e2e check docker-build docker-run clean

install:
	npm ci

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm test

coverage:
	npm run test:coverage

e2e:
	npm run test:e2e

check:
	npm run check
	npm run test:e2e

docker-build:
	docker build -t $(IMAGE) .

docker-run: docker-build
	docker run --rm -p $(PORT):8080 $(IMAGE)

clean:
	rm -rf dist coverage playwright-report test-results
