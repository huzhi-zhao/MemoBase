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

const probeTimeout = 20 * time.Second

// ProbeChat makes a minimal live chat-completion call against the given provider to verify
// that the endpoint and API key are usable. It returns a nil error on success.
func ProbeChat(ctx context.Context, provider ProviderConfig, model string) error {
	model = strings.TrimSpace(model)
	if model == "" {
		return errors.New("model is required")
	}
	if strings.TrimSpace(provider.APIKey) == "" {
		return errors.New("API key is required")
	}

	switch provider.Type {
	case ProviderOpenAI:
		return probeOpenAICompatible(ctx, provider, model)
	case ProviderGemini:
		return probeGemini(ctx, provider, model)
	default:
		return errors.Errorf("unsupported provider type %q", provider.Type)
	}
}

// ProbeEmbed makes a minimal live embedding call against the given provider to verify that the
// endpoint, API key, and embedding model are usable. It returns a nil error on success.
func ProbeEmbed(ctx context.Context, provider ProviderConfig, model string) error {
	ctx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	vectors, err := Embed(ctx, provider, model, []string{"hi"})
	if err != nil {
		return err
	}
	if len(vectors) == 0 || len(vectors[0]) == 0 {
		return errors.New("provider returned an empty embedding")
	}
	return nil
}

func probeOpenAICompatible(ctx context.Context, provider ProviderConfig, model string) error {
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
		"messages": []map[string]string{
			{"role": "user", "content": "hi"},
		},
		// Deliberately omit a token-limit parameter: OpenAI's newer models (o-series,
		// gpt-5.x) reject "max_tokens" and require "max_completion_tokens" instead,
		// while most OpenAI-compatible providers only understand "max_tokens". Leaving
		// it out avoids picking a param name that breaks half of the providers we probe.
		"stream": false,
	})
	if err != nil {
		return errors.Wrap(err, "failed to build request body")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return errors.Wrap(err, "failed to build request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	return doProbeRequest(req)
}

func probeGemini(ctx context.Context, provider ProviderConfig, model string) error {
	endpoint := strings.TrimSpace(provider.Endpoint)
	if endpoint == "" {
		endpoint = "https://generativelanguage.googleapis.com/v1beta"
	}
	endpoint = strings.TrimRight(endpoint, "/")
	if !strings.HasSuffix(endpoint, "/v1beta") && !strings.HasSuffix(endpoint, "/v1") {
		endpoint += "/v1beta"
	}

	body, err := json.Marshal(map[string]any{
		"contents": []map[string]any{
			{"role": "user", "parts": []map[string]string{{"text": "hi"}}},
		},
		"generationConfig": map[string]any{"maxOutputTokens": 5},
	})
	if err != nil {
		return errors.Wrap(err, "failed to build request body")
	}

	url := fmt.Sprintf("%s/models/%s:generateContent", endpoint, model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return errors.Wrap(err, "failed to build request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", provider.APIKey)

	return doProbeRequest(req)
}

func doProbeRequest(req *http.Request) error {
	client := &http.Client{Timeout: probeTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return errors.Wrap(err, "request failed")
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024))
	if err != nil {
		return errors.Wrap(err, "failed to read response")
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return errors.Errorf("provider returned %s: %s", resp.Status, extractErrorMessage(respBody))
	}
	return nil
}

func extractErrorMessage(body []byte) string {
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(body, &parsed); err == nil && parsed.Error.Message != "" {
		return parsed.Error.Message
	}
	text := strings.TrimSpace(string(body))
	if len(text) > 500 {
		text = text[:500]
	}
	return text
}
