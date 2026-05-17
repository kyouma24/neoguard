FROM golang:1.24-alpine AS builder

RUN apk add --no-cache ca-certificates

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .

ARG VERSION=dev
ARG GIT_COMMIT=unknown

RUN CGO_ENABLED=0 go build -trimpath \
    -ldflags="-s -w -X main.version=${VERSION} -X main.gitCommit=${GIT_COMMIT}" \
    -o /neoguard-agent ./cmd/neoguard-agent

FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /neoguard-agent /neoguard-agent
COPY agent.yaml /etc/neoguard/agent.yaml

ENTRYPOINT ["/neoguard-agent"]
CMD ["run", "--config", "/etc/neoguard/agent.yaml"]
