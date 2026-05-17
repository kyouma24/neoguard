package transport

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"
)

// buildTLSConfig creates a TLS config with optional custom CA bundle.
//
// When caBundlePath is empty:
//   - Returns MinVersion: TLS12, RootCAs: nil
//   - Go uses platform/default verifier (exact current behavior)
//
// When caBundlePath is set:
//   - Loads system cert pool (or empty pool if system load fails)
//   - Appends custom CA certificates (additive trust)
//   - Returns MinVersion: TLS12, RootCAs: <system + custom>
//
// Always enforces TLS 1.2 minimum.
func buildTLSConfig(caBundlePath string) (*tls.Config, error) {
	// No custom CA: preserve exact current behavior
	if caBundlePath == "" {
		return &tls.Config{
			MinVersion: tls.VersionTLS12,
			RootCAs:    nil, // Go uses platform default verifier
		}, nil
	}

	// Custom CA path set: additive trust
	// Start with system cert pool (or empty if system load fails)
	certPool, err := loadSystemCertPool()
	if err != nil || certPool == nil {
		// SystemCertPool can fail on minimal containers
		// Fall back to empty pool, append custom CA only
		certPool = x509.NewCertPool()
	}

	// Read and append custom CA bundle
	pemData, err := os.ReadFile(caBundlePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read CA bundle: %w", err)
	}

	if !certPool.AppendCertsFromPEM(pemData) {
		return nil, fmt.Errorf("failed to parse CA bundle: no valid certificates found")
	}

	return &tls.Config{
		RootCAs:    certPool,
		MinVersion: tls.VersionTLS12,
	}, nil
}

// loadSystemCertPool wraps x509.SystemCertPool for testability.
// Tests can replace this var to simulate SystemCertPool failure.
var loadSystemCertPool = x509.SystemCertPool

// newHTTPTransport creates a dedicated http.Transport with TLS config.
// Does NOT mutate http.DefaultTransport.
func newHTTPTransport(caBundlePath string) (*http.Transport, error) {
	tlsConfig, err := buildTLSConfig(caBundlePath)
	if err != nil {
		return nil, err
	}

	return &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConns:        5,
		MaxIdleConnsPerHost: 2,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		TLSClientConfig:     tlsConfig,
		DisableCompression:  true,
	}, nil
}
