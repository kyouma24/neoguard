package transport

import (
	"encoding/json"

	"github.com/neoguard/neo-metrics-exporter/internal/model"
)

// Serializer abstracts the wire format for metrics ingest payloads.
// v1 ships only JSON. The interface exists for future codecs (e.g., Protobuf)
// without rewriting the transport client.
type Serializer interface {
	// Marshal serializes a MetricBatch into wire format bytes.
	Marshal(batch model.MetricBatch) ([]byte, error)

	// ContentType returns the MIME type for the serialized payload.
	ContentType() string
}

// JSONSerializer implements Serializer using JSON encoding.
type JSONSerializer struct{}

func (JSONSerializer) Marshal(batch model.MetricBatch) ([]byte, error) {
	return json.Marshal(batch)
}

func (JSONSerializer) ContentType() string {
	return "application/json"
}
