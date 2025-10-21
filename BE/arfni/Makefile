.PHONY: build test clean install help

# Variables
BINARY_NAME=arfni
VERSION?=0.1.0
BUILD_DIR=./bin
GO_FILES=$(shell find . -name '*.go' -type f)

# Build flags
LDFLAGS=-ldflags "-s -w -X github.com/arfni/arfni/internal/utils/version.Version=$(VERSION)"

help: ## Show this help
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the application
	@echo "Building $(BINARY_NAME)..."
	@go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/arfni
	@echo "Built: $(BUILD_DIR)/$(BINARY_NAME)"

build-windows: ## Build for Windows
	@echo "Building for Windows..."
	@GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME).exe ./cmd/arfni

build-linux: ## Build for Linux
	@echo "Building for Linux..."
	@GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux ./cmd/arfni

build-mac: ## Build for macOS
	@echo "Building for macOS..."
	@GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-mac ./cmd/arfni

build-all: build-windows build-linux build-mac ## Build for all platforms

test: ## Run tests
	@echo "Running tests..."
	@go test -v ./...

test-coverage: ## Run tests with coverage
	@echo "Running tests with coverage..."
	@go test -v -coverprofile=coverage.out ./...
	@go tool cover -html=coverage.out -o coverage.html

clean: ## Clean build artifacts
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@rm -f coverage.out coverage.html

install: ## Install the binary
	@echo "Installing $(BINARY_NAME)..."
	@go install $(LDFLAGS) ./cmd/arfni

run: ## Run the application
	@go run ./cmd/arfni

deps: ## Download dependencies
	@echo "Downloading dependencies..."
	@go mod download
	@go mod tidy

fmt: ## Format code
	@echo "Formatting code..."
	@go fmt ./...
	@goimports -w $(GO_FILES)

lint: ## Run linter
	@echo "Running linter..."
	@golangci-lint run

.DEFAULT_GOAL := help
