package identity

import (
	"context"
	"log/slog"
	"os"
	"runtime"
	"sync"
	"time"
)

const (
	perProviderTimeout  = 2 * time.Second
	totalResolveTimeout = 30 * time.Second
)

type Resolver struct {
	providers []Provider
	skipCloud bool
	stateDir  string

	mu       sync.RWMutex
	cached   *Identity
	cachedAt time.Time
	cacheTTL time.Duration
}

func NewResolver(skipCloud bool) *Resolver {
	return NewResolverWithStateDir(skipCloud, defaultStateDir())
}

func NewResolverWithStateDir(skipCloud bool, stateDir string) *Resolver {
	var providers []Provider
	if !skipCloud {
		providers = []Provider{
			NewAWSProvider(),
			NewAzureProvider(),
		}
	}
	providers = append(providers, NewMachineIDProvider())

	return &Resolver{
		providers: providers,
		skipCloud: skipCloud,
		stateDir:  stateDir,
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

func NewResolverFull(providers []Provider, skipCloud bool, stateDir string) *Resolver {
	return &Resolver{
		providers: providers,
		skipCloud: skipCloud,
		stateDir:  stateDir,
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

	if r.stateDir != "" {
		checkIdentityChange(r.stateDir, id)
		id.AgentID = deriveAgentID(r.stateDir, id)
		if err := savePersistedIdentity(r.stateDir, id); err != nil {
			slog.Error("failed to persist identity", "error", err)
		}
	}

	r.mu.Lock()
	r.cached = id
	r.cachedAt = time.Now()
	r.mu.Unlock()

	return id, nil
}

func (r *Resolver) detect(ctx context.Context) (*Identity, error) {
	if r.skipCloud {
		slog.Info("cloud detection skipped, using hostname fallback")
		id := r.fallbackIdentity()
		id.ResolvedVia = "hostname-skip"
		return id, nil
	}

	resolveCtx, cancel := context.WithTimeout(ctx, totalResolveTimeout)
	defer cancel()

	for _, p := range r.providers {
		if resolveCtx.Err() != nil {
			break
		}

		detectCtx, detectCancel := context.WithTimeout(resolveCtx, perProviderTimeout)
		id, err := p.Detect(detectCtx)
		detectCancel()

		if err == nil {
			id.ResolvedVia = string(p.Name()) + "-imds"
			if p.Name() == ProviderOnPrem {
				id.ResolvedVia = "machine-id"
			}
			slog.Info("identity detected", "provider", p.Name(), "instance_id", id.InstanceID, "resolved_via", id.ResolvedVia)
			return id, nil
		}
		slog.Debug("provider detection failed", "provider", p.Name(), "error", err)
	}

	slog.Warn("identity_fallback_to_hostname: instability risk", "providers_tried", len(r.providers))
	id := r.fallbackIdentity()
	id.ResolvedVia = "hostname-fallback"
	return id, nil
}

func (r *Resolver) fallbackIdentity() *Identity {
	hostname, _ := os.Hostname()
	return &Identity{
		CloudProvider: ProviderUnknown,
		InstanceID:    "host-" + hostname,
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

func defaultStateDir() string {
	if runtime.GOOS == "windows" {
		return `C:\ProgramData\NeoGuard`
	}
	return "/var/lib/neoguard"
}
