BOOTSTRAP_PYTHON ?= python3
VENV ?= .venv
PYTHON := $(VENV)/bin/python
PIP := $(VENV)/bin/pip
PYTEST := $(VENV)/bin/pytest
UVICORN := $(VENV)/bin/uvicorn

.PHONY: bootstrap install check-env demo-check reset-db run demo test frontend-install frontend-build frontend-dev test-e2e test-all run-e2e-server guard-venv

guard-venv:
	@test -x "$(PYTHON)" || (echo "Virtual environment is missing. Run 'make bootstrap' first."; exit 1)

bootstrap: install reset-db

install:
	$(BOOTSTRAP_PYTHON) -m venv $(VENV)
	$(PIP) install --upgrade pip
	$(PIP) install -r requirements.txt

check-env: guard-venv
	$(PYTHON) scripts/check_env.py

demo-check: guard-venv
	$(PYTHON) scripts/check_env.py --require-static

reset-db: guard-venv
	$(PYTHON) scripts/reset_db.py

run: guard-venv
	$(UVICORN) app.main:app --reload

demo: guard-venv
	./scripts/run_demo.sh

test: guard-venv
	$(PYTEST) -q

test-e2e: guard-venv
	npm run test:e2e

test-all: test frontend-build test-e2e

frontend-install:
	npm install

frontend-build:
	npm run build

frontend-dev:
	npm run dev

run-e2e-server: guard-venv
	./scripts/run_e2e_server.sh
