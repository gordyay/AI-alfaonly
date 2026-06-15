# Воспроизводимый запуск прототипа «ИИ-ассистент Alfa Only» (отчёт §6.5).
# Бэкенд (FastAPI) — порт 8000, фронтенд (React/Vite) — порт 4173.

PY ?= python3.12
VENV := backend/.venv

.PHONY: setup seed backend frontend dev build test test-backend e2e clean help

help:
	@echo "make setup   — создать venv бэкенда, установить зависимости (Python + npm)"
	@echo "make backend — запустить API (uvicorn, http://127.0.0.1:8000)"
	@echo "make frontend— запустить интерфейс (vite, http://127.0.0.1:4173)"
	@echo "make dev     — запустить бэкенд и фронтенд вместе"
	@echo "make build   — собрать фронтенд (tsc + vite build)"
	@echo "make test    — все тесты: pytest + Playwright E2E"
	@echo "make seed    — пересобрать backend/app/seed/seed.json из данных фронтенда"

setup:
	$(PY) -m venv $(VENV)
	$(VENV)/bin/pip install --upgrade pip
	$(VENV)/bin/pip install -r backend/requirements.txt
	npm install

seed:
	npm run export-seed

backend:
	cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

frontend:
	npm run dev

# Запуск обоих сервисов: бэкенд в фоне, фронтенд на переднем плане.
dev:
	@echo "Бэкенд → http://127.0.0.1:8000/api  ·  Интерфейс → http://127.0.0.1:4173"
	@trap 'kill 0' EXIT; \
	  (cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000) & \
	  npm run dev

build:
	npm run build

test-backend:
	cd backend && .venv/bin/pytest

e2e: build
	npm run e2e

test: test-backend e2e

clean:
	rm -f backend/*.db backend/*.db-wal backend/*.db-shm
	rm -rf dist test-results playwright-report
