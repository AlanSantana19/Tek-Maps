.PHONY: deploy build up down logs

GIT_SHA           := $(shell git rev-parse --short HEAD 2>/dev/null || echo local)
GIT_COMMIT_COUNT  := $(shell git rev-list --count HEAD 2>/dev/null || echo 0)
BUILD_DATE        := $(shell date -u +%Y-%m-%d)

export GIT_SHA
export GIT_COMMIT_COUNT
export BUILD_DATE

deploy:
	docker compose up --build -d

build:
	docker compose build \
		--build-arg GIT_SHA=$(GIT_SHA) \
		--build-arg GIT_COMMIT_COUNT=$(GIT_COMMIT_COUNT) \
		--build-arg BUILD_DATE=$(BUILD_DATE)

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f
