package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/pkg/errors"
)

const embeddingTimeout = 2 * time.Minute

// ErrRateLimited marks a provider 429 response. Callers should back off for a
// rate-limit window instead of fast-retrying (which just burns more quota).
var ErrRateLimited = errors.New("embedding provider rate limited")

// DefaultOpenAIEmbeddingModel is the built-in OpenAI embedding model.
const DefaultOpenAIEmbeddingModel = "text-embedding-3-small"

// DefaultGeminiEmbeddingModel is the built-in Gemini embedding model.
const DefaultGeminiEmbeddingModel = "text-embedding-004"

// DefaultEmbeddingModel returns the built-in embedding model for a provider.
func DefaultEmbeddingModel(providerType ProviderType) (string, error) {
	switch providerType {
	case ProviderOpenAI:
		return DefaultOpenAIEmbeddingModel, nil
	case ProviderGemini:
		return DefaultGeminiEmbeddingModel, nil
	default:
		return "", errors.Wrapf(ErrCapabilityUnsupported, "provider type %q", providerType)
	}
}

// Embed generates embedding vectors for the given inputs against the provider's embedding model.
// The returned slice is aligned with inputs (result[i] is the vector for inputs[i]).
func Embed(ctx context.Context, provider ProviderConfig, model string, inputs []string) ([][]float32, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return nil, errors.New("embedding model is required")
	}
	if strings.TrimSpace(provider.APIKey) == "" {
		return nil, errors.New("API key is required")
	}
	if len(inputs) == 0 {
		return [][]float32{}, nil
	}

	switch provider.Type {
	case ProviderOpenAI:
		return embedOpenAICompatible(ctx, provider, model, inputs)
	case ProviderGemini:
		return embedGemini(ctx, provider, model, inputs)
	default:
		return nil, errors.Errorf("unsupported provider type %q", provider.Type)
	}
}

func embedOpenAICompatible(ctx context.Context, provider ProviderConfig, model string, inputs []string) ([][]float32, error) {
	endpoint := strings.TrimSpace(provider.Endpoint)
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1"
	}

	body, err := json.Marshal(map[string]any{
		"model": model,
		"input": inputs,
	})
	if err != nil {
		return nil, errors.Wrap(err, "failed to build request body")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, errors.Wrap(err, "failed to build request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	respBody, err := doEmbeddingRequest(req)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Data []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, errors.Wrap(err, "failed to parse response")
	}
	if len(parsed.Data) != len(inputs) {
		return nil, errors.Errorf("expected %d embeddings, got %d", len(inputs), len(parsed.Data))
	}
	// The API preserves input order, but honor the returned index to be safe.
	result := make([][]float32, len(inputs))
	for _, d := range parsed.Data {
		if d.Index < 0 || d.Index >= len(result) {
			return nil, errors.Errorf("embedding index %d out of range", d.Index)
		}
		result[d.Index] = d.Embedding
	}
	for i, v := range result {
		if len(v) == 0 {
			return nil, errors.Errorf("empty embedding for input %d", i)
		}
	}
	return result, nil
}

func embedGemini(ctx context.Context, provider ProviderConfig, model string, inputs []string) ([][]float32, error) {
	endpoint := strings.TrimSpace(provider.Endpoint)
	if endpoint == "" {
		endpoint = "https://generativelanguage.googleapis.com/v1beta"
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if !strings.HasSuffix(endpoint, "/v1beta") && !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1beta"
	}

	modelPath := model
	if !strings.HasPrefix(modelPath, "models/") {
		modelPath = "models/" + modelPath
	}
	requests := make([]map[string]any, 0, len(inputs))
	for _, input := range inputs {
		requests = append(requests, map[string]any{
			"model":   modelPath,
			"content": map[string]any{"parts": []map[string]string{{"text": input}}},
		})
	}
	body, err := json.Marshal(map[string]any{"requests": requests})
	if err != nil {
		return nil, errors.Wrap(err, "failed to build request body")
	}

	url := fmt.Sprintf("%s/%s:batchEmbedContents", endpoint, modelPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, errors.Wrap(err, "failed to build request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", provider.APIKey)

	respBody, err := doEmbeddingRequest(req)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Embeddings []struct {
			Values []float32 `json:"values"`
		} `json:"embeddings"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, errors.Wrap(err, "failed to parse response")
	}
	if len(parsed.Embeddings) != len(inputs) {
		return nil, errors.Errorf("expected %d embeddings, got %d", len(inputs), len(parsed.Embeddings))
	}
	result := make([][]float32, len(inputs))
	for i, e := range parsed.Embeddings {
		if len(e.Values) == 0 {
			return nil, errors.Errorf("empty embedding for input %d", i)
		}
		result[i] = e.Values
	}
	return result, nil
}

func doEmbeddingRequest(req *http.Request) ([]byte, error) {
	client := &http.Client{Timeout: embeddingTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, errors.Wrap(err, "request failed")
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024*1024))
	if err != nil {
		return nil, errors.Wrap(err, "failed to read response")
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, errors.Wrapf(ErrRateLimited, "provider returned %s: %s", resp.Status, extractErrorMessage(respBody))
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, errors.Errorf("provider returned %s: %s", resp.Status, extractErrorMessage(respBody))
	}
	return respBody, nil
}
