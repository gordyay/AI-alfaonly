PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PYTEST ?= $(shell if [ -x "$(VENV)/bin/pytest" ]; then echo "$(VENV)/bin/pytest"; else echo "pytest"; fi)
UVICORN ?= $(shell if [ -x "$(VENV)/bin/uvicorn" ]; then echo "$(VENV)/bin/uvicorn"; else echo "uvicorn"; fi)

.PHONY: bootstrap install reset-db run test frontend-install frontend-build frontend-dev test-e2e test-all

bootstrap: install reset-db

install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

reset-db:
	$(PYTHON) scripts/reset_db.py

run:
	$(UVICORN) app.main:app --reload

test:
	$(PYTEST) -q

test-e2e:
	npm run test:e2e

test-all: test frontend-build test-e2e

frontend-install:
	npm install

frontend-build:
	npm run build

frontend-dev:
	npm run dev
