.DEFAULT_GOAL := help
SHELL := /bin/bash
PNPM  := pnpm

# Usa o Node 22 do Homebrew quando existir, sem exigir que ele seja o Node padrão da máquina.
NODE22_BIN := $(shell brew --prefix node@22 2>/dev/null)/bin
export PATH := $(NODE22_BIN):$(PATH)

.PHONY: help setup dev dev-ext build build-app build-ext build-native \
        rebuild lint format typecheck test test-e2e test-visual ci \
        db-generate db-migrate db-studio package release clean

help: ## Lista os alvos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

setup: ## Instala dependências, hooks e compila módulos nativos
	corepack enable
	$(PNPM) install
	$(PNPM) lefthook install
	$(MAKE) rebuild

dev: ## Roda o app Electron com hot reload
	$(PNPM) --filter desktop dev

dev-ext: ## Roda a extensão em modo dev (abre o Chrome com ela carregada)
	$(PNPM) --filter extension dev

build: build-app build-ext ## Build de produção do app e da extensão

build-app:
	$(PNPM) --filter desktop build

build-ext:
	$(PNPM) --filter extension build

build-native: ## Compila o helper de áudio em Swift (fase 4)
	@if [ -f apps/desktop/native/audio-helper/Package.swift ]; then \
	  swift build -c release --package-path apps/desktop/native/audio-helper; \
	else \
	  echo "Helper de áudio ainda não existe (fase 4): nada a compilar."; \
	fi

rebuild: ## Recompila better-sqlite3 para a versão do Electron
	$(PNPM) --filter desktop exec electron-builder install-app-deps

lint: ## ESLint em todo o monorepo
	$(PNPM) -r lint

format: ## Prettier em todo o monorepo
	$(PNPM) prettier --write .

typecheck: ## Checagem de tipos
	$(PNPM) -r typecheck

test: ## Testes de unidade e integração
	$(PNPM) -r test

test-e2e: build ## Testes ponta a ponta com Playwright
	$(PNPM) --filter desktop test:e2e

test-visual: ## Compara as telas com os frames do mockup em design/reference
	$(PNPM) --filter desktop test:visual

ci: lint typecheck test ## O que o CI roda em cada PR

db-generate: ## Gera migração a partir do schema Drizzle
	$(PNPM) --filter db drizzle-kit generate

db-migrate: ## Aplica migrações no banco de desenvolvimento
	$(PNPM) --filter db drizzle-kit migrate

db-studio: ## Abre o Drizzle Studio para inspecionar o banco
	$(PNPM) --filter db drizzle-kit studio

package: build build-native ## Gera o .dmg local, sem assinatura
	$(PNPM) --filter desktop exec electron-builder --mac --publish never \
	  -c.mac.identity=null

release: ci build build-native ## .dmg assinado e notarizado + zip da extensão
	$(PNPM) --filter desktop exec electron-builder --mac --publish never
	$(PNPM) --filter extension zip

clean: ## Remove builds e caches
	rm -rf apps/*/out apps/*/dist apps/extension/.output node_modules/.cache
