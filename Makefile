# MaxCode Invoice - Makefile
# Convenience commands for development and deployment

.PHONY: help install dev build deploy clean test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all dependencies
	@echo "📦 Installing dependencies..."
	@npm install
	@cd backend && npm install
	@cd maxcode-invoice-software && npm install
	@echo "✅ All dependencies installed!"

dev: ## Run frontend and backend in development mode
	@echo "🚀 Starting development servers..."
	@npm run dev

dev-frontend: ## Run only frontend
	@echo "🚀 Starting frontend..."
	@cd maxcode-invoice-software && npm run dev

dev-backend: ## Run only backend
	@echo "🚀 Starting backend..."
	@cd backend && npm run dev

build: ## Build frontend and backend for production
	@echo "🔨 Building application..."
	@npm run build
	@echo "✅ Build complete!"

deploy: ## Deploy to Netlify
	@echo "🚀 Deploying to Netlify..."
	@npm run deploy
	@echo "✅ Deployment complete!"

deploy-preview: ## Deploy preview to Netlify
	@echo "🚀 Deploying preview..."
	@cd backend && npm run deploy:preview
	@cd maxcode-invoice-software && netlify deploy
	@echo "✅ Preview deployment complete!"

clean: ## Clean node_modules and build artifacts
	@echo "🧹 Cleaning up..."
	@rm -rf node_modules
	@rm -rf maxcode-invoice-software/node_modules maxcode-invoice-software/dist
	@rm -rf backend/node_modules backend/.netlify
	@rm -rf .netlify
	@echo "✅ Cleanup complete!"

reset: clean install ## Clean and reinstall everything
	@echo "✅ Reset complete!"

test: ## Run tests
	@echo "🧪 Running tests..."
	@npm test

lint: ## Run linter on frontend
	@echo "🔍 Linting frontend..."
	@cd maxcode-invoice-software && npm run lint

setup-env: ## Copy .env.example files
	@echo "📝 Setting up environment files..."
	@cp -n .env.example backend/.env || echo "backend/.env already exists"
	@echo "✅ Environment files ready! Please edit backend/.env with your MongoDB URI"

check: ## Check if all required tools are installed
	@echo "🔍 Checking system requirements..."
	@command -v node >/dev/null 2>&1 || { echo "❌ Node.js is not installed"; exit 1; }
	@echo "✅ Node.js: $$(node --version)"
	@command -v npm >/dev/null 2>&1 || { echo "❌ npm is not installed"; exit 1; }
	@echo "✅ npm: $$(npm --version)"
	@command -v git >/dev/null 2>&1 || { echo "❌ git is not installed"; exit 1; }
	@echo "✅ git: $$(git --version)"
	@echo "✅ All requirements met!"

logs-frontend: ## Show frontend logs
	@cd maxcode-invoice-software && netlify logs

logs-backend: ## Show backend function logs
	@cd backend && netlify logs:function

status: ## Check deployment status
	@echo "📊 Deployment Status:"
	@cd backend && netlify status || echo "Backend not linked"
	@cd maxcode-invoice-software && netlify status || echo "Frontend not linked"

link: ## Link to existing Netlify site
	@echo "🔗 Linking to Netlify..."
	@netlify link

init: check setup-env install ## Initialize project (check requirements, setup env, install)
	@echo "✅ Project initialized! Run 'make dev' to start development"
