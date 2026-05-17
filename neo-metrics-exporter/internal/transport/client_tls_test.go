package transport

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// generateCAAndServerCert generates a CA certificate and a CA-signed server certificate using crypto/x509
func generateCAAndServerCert(t *testing.T, dir string) (caPath, certPath, keyPath string) {
	t.Helper()

	// Generate CA private key
	caPrivKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate CA key: %v", err)
	}

	// Create CA certificate template
	caTemplate := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Country:      []string{"US"},
			Province:     []string{"Test"},
			Locality:     []string{"Test"},
			Organization: []string{"Test"},
			CommonName:   "Test CA",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	// Self-sign CA certificate
	caCertDER, err := x509.CreateCertificate(rand.Reader, &caTemplate, &caTemplate, &caPrivKey.PublicKey, caPrivKey)
	if err != nil {
		t.Fatalf("failed to create CA cert: %v", err)
	}

	// Write CA certificate to file
	caPath = filepath.Join(dir, "ca.pem")
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caCertDER})
	if err := os.WriteFile(caPath, caPEM, 0600); err != nil {
		t.Fatalf("failed to write CA cert: %v", err)
	}

	// Generate server private key
	serverPrivKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate server key: %v", err)
	}

	// Create server certificate template with SAN
	serverTemplate := x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject: pkix.Name{
			Country:      []string{"US"},
			Province:     []string{"Test"},
			Locality:     []string{"Test"},
			Organization: []string{"Test"},
			CommonName:   "localhost",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost"},
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
	}

	// Sign server certificate with CA
	serverCertDER, err := x509.CreateCertificate(rand.Reader, &serverTemplate, &caTemplate, &serverPrivKey.PublicKey, caPrivKey)
	if err != nil {
		t.Fatalf("failed to create server cert: %v", err)
	}

	// Write server certificate to file
	certPath = filepath.Join(dir, "server.pem")
	serverCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: serverCertDER})
	if err := os.WriteFile(certPath, serverCertPEM, 0600); err != nil {
		t.Fatalf("failed to write server cert: %v", err)
	}

	// Write server private key to file
	keyPath = filepath.Join(dir, "server-key.pem")
	serverKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(serverPrivKey),
	})
	if err := os.WriteFile(keyPath, serverKeyPEM, 0600); err != nil {
		t.Fatalf("failed to write server key: %v", err)
	}

	return caPath, certPath, keyPath
}

// Test: metrics client with custom CA accepts CA-signed server
func TestMetricsClientWithCustomCA(t *testing.T) {
	dir := t.TempDir()
	caPath, certPath, keyPath := generateCAAndServerCert(t, dir)

	// Create TLS server with CA-signed certificate
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		json.NewEncoder(w).Encode(map[string]int{"accepted": 5})
	}))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	srv.StartTLS()
	defer srv.Close()

	// Create client with custom CA
	client, err := NewClient(srv.URL, "test-key", 5*time.Second, "1.0.0", caPath)
	if err != nil {
		t.Fatal(err)
	}

	err = client.Send(context.Background(), []model.MetricPoint{
		model.NewGauge("test.metric", 1.0, map[string]string{"host": "test"}),
	})
	if err != nil {
		t.Fatalf("send failed: %v", err)
	}
}

// Test: lifecycle client with custom CA accepts CA-signed server
func TestLifecycleClientWithCustomCA(t *testing.T) {
	dir := t.TempDir()
	caPath, certPath, keyPath := generateCAAndServerCert(t, dir)

	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v1/agents/register" {
			resp := RegisterResponse{
				ID:                      "internal-123",
				AgentIDExternal:         "agent-123",
				Status:                  "active",
				NegotiatedSchemaVersion: 1,
				HeartbeatIntervalSecs:   45,
				FirstRegistration:       true,
			}
			json.NewEncoder(w).Encode(resp)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	srv.StartTLS()
	defer srv.Close()

	lifecycle, err := NewLifecycleClient(srv.URL, "test-key", 5*time.Second, caPath)
	if err != nil {
		t.Fatal(err)
	}

	_, err = lifecycle.Register(context.Background(), &RegisterRequest{
		AgentIDExternal:         "agent-123",
		Hostname:                "test-host",
		ResourceID:              "i-abc123",
		OS:                      "linux",
		Arch:                    "amd64",
		AgentVersion:            "1.0.0",
		Capabilities:            map[string]any{"metrics": true},
		ConfigHash:              "sha256:abc",
		SupportedSchemaVersions: []int{1},
		HeartbeatIntervalSecs:   30,
	})
	if err != nil {
		t.Fatalf("register failed: %v", err)
	}
}

// Test: client with wrong CA rejects CA-signed server (returns RetryableError)
func TestMetricsClientWithWrongCA(t *testing.T) {
	dir := t.TempDir()
	_, certPath, keyPath := generateCAAndServerCert(t, dir)

	// Generate different (wrong) CA using crypto/x509
	wrongCAPrivKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("failed to generate wrong CA key: %v", err)
	}

	wrongCATemplate := x509.Certificate{
		SerialNumber: big.NewInt(999),
		Subject: pkix.Name{
			Country:      []string{"US"},
			Province:     []string{"Test"},
			Locality:     []string{"Test"},
			Organization: []string{"Wrong"},
			CommonName:   "Wrong CA",
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
	}

	wrongCACertDER, err := x509.CreateCertificate(rand.Reader, &wrongCATemplate, &wrongCATemplate, &wrongCAPrivKey.PublicKey, wrongCAPrivKey)
	if err != nil {
		t.Fatalf("failed to create wrong CA cert: %v", err)
	}

	wrongCAPath := filepath.Join(dir, "wrong-ca.pem")
	wrongCAPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: wrongCACertDER})
	if err := os.WriteFile(wrongCAPath, wrongCAPEM, 0600); err != nil {
		t.Fatalf("failed to write wrong CA cert: %v", err)
	}

	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	srv.TLS = &tls.Config{Certificates: []tls.Certificate{cert}}
	srv.StartTLS()
	defer srv.Close()

	// Create client with wrong CA
	client, err := NewClient(srv.URL, "test-key", 5*time.Second, "1.0.0", wrongCAPath)
	if err != nil {
		t.Fatal(err)
	}

	err = client.Send(context.Background(), []model.MetricPoint{
		model.NewGauge("test.metric", 1.0, map[string]string{"host": "test"}),
	})

	if err == nil {
		t.Fatal("expected TLS verification error, got nil")
	}

	// TLS handshake failure should be wrapped as RetryableError
	if _, ok := err.(*RetryableError); !ok {
		t.Fatalf("expected RetryableError for TLS failure, got %T: %v", err, err)
	}
}

// Test: client with no custom CA uses platform defaults (httptest with self-signed should fail)
func TestMetricsClientNoCustomCARejectsUntrusted(t *testing.T) {
	// httptest.NewTLSServer uses self-signed cert NOT in system pool
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	// Create client with no custom CA (empty path)
	client, err := NewClient(srv.URL, "test-key", 5*time.Second, "1.0.0", "")
	if err != nil {
		t.Fatal(err)
	}

	err = client.Send(context.Background(), []model.MetricPoint{
		model.NewGauge("test.metric", 1.0, map[string]string{"host": "test"}),
	})

	if err == nil {
		t.Fatal("expected TLS verification error, got nil")
	}

	if _, ok := err.(*RetryableError); !ok {
		t.Fatalf("expected RetryableError for untrusted cert, got %T: %v", err, err)
	}
}

// Note: Additive trust (SystemCertPool + AppendCertsFromPEM) is tested at the unit level
// in tls_test.go via TestBuildTLSConfigValid. Integration-level proof requires either
// external network (nondeterministic) or a second in-process HTTPS server with system-trusted
// cert (not feasible in Go tests). The unit test provides adequate evidence that custom CA
// certificates are appended to system roots, not replaced.
