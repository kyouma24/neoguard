VERSION ?= 0.2.0
BUILD_TIME := $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME) -X main.gitCommit=$(GIT_COMMIT)

.PHONY: build build-linux build-linux-arm64 build-windows build-all test lint clean package-deb package-rpm bench bench-check bench-update

build:
	go build -trimpath -ldflags="$(LDFLAGS)" -o bin/neoguard-agent ./cmd/neoguard-agent

build-linux:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/neoguard-agent-linux-amd64 ./cmd/neoguard-agent

build-linux-arm64:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/neoguard-agent-linux-arm64 ./cmd/neoguard-agent

build-windows:
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="$(LDFLAGS)" -o bin/neoguard-agent-windows-amd64.exe ./cmd/neoguard-agent

build-all: build-linux build-linux-arm64 build-windows

test:
	go test -count=1 -timeout 120s ./...

test-race:
	go test -race -count=1 -timeout 120s ./...

lint:
	go vet ./...

package-deb: build-linux
	VERSION=$(VERSION) GOARCH=amd64 nfpm package --packager deb --target bin/

package-rpm: build-linux
	VERSION=$(VERSION) GOARCH=amd64 nfpm package --packager rpm --target bin/

bench:
	go test -bench=. -benchmem -count=5 -timeout 300s ./test/perf/

bench-check:
	bash test/perf/check_regression.sh test/perf/baselines.json

bench-update:
	@echo "Running benchmarks to update baselines..."
	@go test -bench=. -benchmem -count=5 -timeout 300s ./test/perf/ > /tmp/bench_output.txt 2>&1
	@python3 -c "\
import json, re;\
with open('test/perf/baselines.json') as f: data = json.load(f);\
with open('/tmp/bench_output.txt') as f: output = f.read();\
for name in data.get('benchmarks', {}):\
    match = re.search(r'^' + name + r'-\d+\s+\d+\s+([\d.]+)\s+ns/op', output, re.MULTILINE);\
    if match: data['benchmarks'][name] = float(match.group(1));\
import subprocess;\
result = subprocess.run(['stat', '--format=%s', 'bin/neoguard-agent-linux-amd64'], capture_output=True, text=True);\
if result.returncode == 0: data['binary_size_bytes'] = int(result.stdout.strip());\
with open('test/perf/baselines.json', 'w') as f: json.dump(data, f, indent=2);\
print('Baselines updated.')"

clean:
	rm -rf bin/
