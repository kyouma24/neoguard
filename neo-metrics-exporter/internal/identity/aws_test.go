package identity

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func newMockIMDS(t *testing.T) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	mux.HandleFunc("PUT /latest/api/token", func(w http.ResponseWriter, r *http.Request) {
		ttl := r.Header.Get("X-aws-ec2-metadata-token-ttl-seconds")
		if ttl == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Write([]byte("test-imds-token-12345"))
	})

	mux.HandleFunc("GET /latest/meta-data/instance-id", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-aws-ec2-metadata-token") != "test-imds-token-12345" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Write([]byte("i-0abc123def456"))
	})

	mux.HandleFunc("GET /latest/meta-data/placement/region", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("us-east-1"))
	})

	mux.HandleFunc("GET /latest/meta-data/placement/availability-zone", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("us-east-1a"))
	})

	mux.HandleFunc("GET /latest/meta-data/instance-type", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("t3.large"))
	})

	mux.HandleFunc("GET /latest/dynamic/instance-identity/document", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"accountId":"123456789012","region":"us-east-1"}`))
	})

	return httptest.NewServer(mux)
}

func TestAWSDetect(t *testing.T) {
	srv := newMockIMDS(t)
	defer srv.Close()

	p := NewAWSProviderWithBase(srv.URL)
	id, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	if id.CloudProvider != ProviderAWS {
		t.Errorf("provider = %q", id.CloudProvider)
	}
	if id.InstanceID != "i-0abc123def456" {
		t.Errorf("instance_id = %q", id.InstanceID)
	}
	if id.Region != "us-east-1" {
		t.Errorf("region = %q", id.Region)
	}
	if id.AvailabilityZone != "us-east-1a" {
		t.Errorf("az = %q", id.AvailabilityZone)
	}
	if id.AccountID != "123456789012" {
		t.Errorf("account_id = %q", id.AccountID)
	}
	if id.InstanceType != "t3.large" {
		t.Errorf("instance_type = %q", id.InstanceType)
	}
}

func TestAWSDetectTokenFailure(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	p := NewAWSProviderWithBase(srv.URL)
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error when token fails")
	}
}

func TestAWSDetectInstanceIDFailure(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("PUT /latest/api/token", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("token"))
	})
	mux.HandleFunc("GET /latest/meta-data/instance-id", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	p := NewAWSProviderWithBase(srv.URL)
	_, err := p.Detect(context.Background())
	if err == nil {
		t.Fatal("expected error when instance-id fails")
	}
}

func TestAWSName(t *testing.T) {
	p := NewAWSProvider()
	if p.Name() != ProviderAWS {
		t.Errorf("name = %q", p.Name())
	}
}

func TestAWSIMDSv2RequiresToken(t *testing.T) {
	srv := newMockIMDS(t)
	defer srv.Close()

	p := NewAWSProviderWithBase(srv.URL)
	id, err := p.Detect(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if id.InstanceID != "i-0abc123def456" {
		t.Errorf("expected IMDSv2 token-based auth to work, got instance_id = %q", id.InstanceID)
	}
}
