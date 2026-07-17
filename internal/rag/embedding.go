package rag

import (
	"context"

	"github.com/usememos/memos/internal/ai"
	storepb "github.com/usememos/memos/proto/gen/store"
	"github.com/usememos/memos/store"
)

// EmbeddingResolution describes the currently-configured embedding model, if any.
type EmbeddingResolution struct {
	// Configured reports whether a usable embedding provider + model is set up.
	Configured bool
	Provider   ai.ProviderConfig
	Model      string
}

// resolveEmbedding reads the instance AI setting and resolves the embedding
// provider config and model. When embedding is not configured (no provider id,
// missing provider, or missing API key), Configured is false and search falls
// back to keyword-only retrieval.
func resolveEmbedding(ctx context.Context, s *store.Store) (EmbeddingResolution, error) {
	setting, err := s.GetInstanceAISetting(ctx)
	if err != nil {
		return EmbeddingResolution{}, err
	}
	embedding := setting.GetEmbedding()
	providerID := embedding.GetProviderId()
	if providerID == "" {
		return EmbeddingResolution{}, nil
	}

	var matched *storepb.AIProviderConfig
	for _, p := range setting.GetProviders() {
		if p.GetId() == providerID {
			matched = p
			break
		}
	}
	if matched == nil || matched.GetApiKey() == "" {
		return EmbeddingResolution{}, nil
	}

	provider := ai.ProviderConfig{
		ID:       matched.GetId(),
		Title:    matched.GetTitle(),
		Type:     providerTypeFromStore(matched.GetType()),
		Endpoint: matched.GetEndpoint(),
		APIKey:   matched.GetApiKey(),
	}
	if provider.Type == "" {
		return EmbeddingResolution{}, nil
	}

	model := embedding.GetModel()
	if model == "" {
		defaultModel, err := ai.DefaultEmbeddingModel(provider.Type)
		if err != nil {
			return EmbeddingResolution{}, nil
		}
		model = defaultModel
	}
	return EmbeddingResolution{Configured: true, Provider: provider, Model: model}, nil
}

// EmbeddingConfigured reports whether a usable embedding model is configured,
// i.e. whether semantic search is available.
func EmbeddingConfigured(ctx context.Context, s *store.Store) (bool, error) {
	resolution, err := resolveEmbedding(ctx, s)
	if err != nil {
		return false, err
	}
	return resolution.Configured, nil
}

func providerTypeFromStore(t storepb.AIProviderType) ai.ProviderType {
	switch t {
	case storepb.AIProviderType_OPENAI:
		return ai.ProviderOpenAI
	case storepb.AIProviderType_GEMINI:
		return ai.ProviderGemini
	default:
		return ""
	}
}
