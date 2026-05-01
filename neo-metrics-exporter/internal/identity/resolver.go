package identity

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"sync"
	"time"
)

type Resolver struct {
	providers []Provider
	skipCloud bool

	mu       sync.RWMutex
	cached   *Identity
	cachedAt time.Time
	cacheTTL time.Duration
}

func NewResolver(skipCloud bool) *Resolver {
	var providers []Provider
	if !skipCloud {
		providers = []Provider{
			NewAWSProvider(),
			NewAzureProvider(),
		}
	}
	return &Resolver{
		providers: providers,
		skipCloud: skipCloud,
		cacheTTL:  1 * time.Hour,
	}
}

func NewResolverWithProviders(providers []Provider, skipCloud bool) *Resolver {
	return &Resolver{
		providers: providers,
		skipCloud: skipCloud,
		cacheTTL:  1 * time.Hour,
	}
}

func (r *Resolver) Resolve(ctx context.Context) (*Identity, error) {
	r.mu.RLock()
	if r.cached != nil && time.Since(r.cachedAt) < r.cacheTTL {
		id := r.cached
		r.mu.RUnlock()
		return id, nil
	}
	r.mu.RUnlock()

	id, err := r.detect(ctx)
	if err != nil {
		return nil, err
	}

	r.fillHostInfo(id)

	r.mu.Lock()
	r.cached = id
	r.cachedAt = time.Now()
	r.mu.Unlock()

	return id, nil
}

func (r *Resolver) detect(ctx context.Context) (*Identity, error) {
	if r.skipCloud {
		slog.Info("cloud detection skipped, using hostname fallback")
		return r.fallbackIdentity(), nil
	}

	for _, p := range r.providers {
		detectCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
		id, err := p.Detect(detectCtx)
		cancel()

		if err == nil {
			slog.Info("cloud identity detected", "provider", p.Name(), "instance_id", id.InstanceID)
			return id, nil
		}
		slog.Debug("cloud provider detection failed", "provider", p.Name(), "error", err)
	}

	slog.Info("no cloud provider detected, falling back to hostname", "providers_tried", len(r.providers))
	return r.fallbackIdentity(), nil
}

func (r *Resolver) fallbackIdentity() *Identity {
	hostname, _ := os.Hostname()
	return &Identity{
		CloudProvider: ProviderUnknown,
		InstanceID:    hostname,
		Hostname:      hostname,
		OS:            runtime.GOOS,
	}
}

func (r *Resolver) fillHostInfo(id *Identity) {
	if id.Hostname == "" {
		id.Hostname, _ = os.Hostname()
	}
	if id.OS == "" {
		id.OS = runtime.GOOS
	}
}

func (r *Resolver) InvalidateCache() {
	r.mu.Lock()
	r.cached = nil
	r.mu.Unlock()
}
