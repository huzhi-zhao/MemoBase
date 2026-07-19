package v1

import (
	"bytes"
	"context"
	"mime"
	"net/http"
	"regexp"
	"strings"

	"github.com/pkg/errors"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/usememos/memos/internal/ai"
	"github.com/usememos/memos/internal/ai/audiollm"
	audiollmgemini "github.com/usememos/memos/internal/ai/audiollm/gemini"
	"github.com/usememos/memos/internal/ai/stt"
	sttopenai "github.com/usememos/memos/internal/ai/stt/openai"
	v1pb "github.com/usememos/memos/proto/gen/api/v1"
	storepb "github.com/usememos/memos/proto/gen/store"
)

const (
	maxTranscriptionAudioSizeBytes = 25 * MebiByte
	maxTranscriptionFilenameLength = 255
)

var supportedTranscriptionContentTypes = map[string]bool{
	"audio/aac":    true,
	"audio/aiff":   true,
	"audio/flac":   true,
	"audio/mpeg":   true,
	"audio/mp3":    true,
	"audio/mp4":    true,
	"audio/mpga":   true,
	"audio/ogg":    true,
	"audio/wav":    true,
	"audio/x-wav":  true,
	"audio/x-flac": true,
	"audio/x-m4a":  true,
	"audio/webm":   true,
	"video/mp4":    true,
	"video/mpeg":   true,
	"video/webm":   true,
}

// Transcribe transcribes an audio file using an instance AI provider.
func (s *APIV1Service) Transcribe(ctx context.Context, request *v1pb.TranscribeRequest) (*v1pb.TranscribeResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	if request.Audio == nil {
		return nil, status.Errorf(codes.InvalidArgument, "audio is required")
	}
	if request.Audio.GetUri() != "" {
		return nil, status.Errorf(codes.InvalidArgument, "audio uri is not supported")
	}
	content := request.Audio.GetContent()
	if len(content) == 0 {
		return nil, status.Errorf(codes.InvalidArgument, "audio content is required")
	}
	if len(content) > maxTranscriptionAudioSizeBytes {
		return nil, status.Errorf(codes.InvalidArgument, "audio file is too large; maximum size is 25 MiB")
	}
	filename := strings.TrimSpace(request.Audio.GetFilename())
	if len(filename) > maxTranscriptionFilenameLength {
		return nil, status.Errorf(codes.InvalidArgument, "filename is too long; maximum length is %d characters", maxTranscriptionFilenameLength)
	}
	contentType := strings.TrimSpace(request.Audio.GetContentType())
	if contentType == "" {
		contentType = http.DetectContentType(content)
	}
	if !isSupportedTranscriptionContentType(contentType) {
		return nil, status.Errorf(codes.InvalidArgument, "audio content type %q is not supported", contentType)
	}

	aiSetting, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get AI setting: %v", err)
	}
	persisted := aiSetting.GetTranscription()

	providerID := persisted.GetProviderId()
	if providerID == "" {
		return nil, status.Errorf(codes.FailedPrecondition, "transcription is not configured")
	}

	provider, err := s.resolveAIProvider(aiSetting, providerID)
	if err != nil {
		return nil, err
	}

	model := persisted.GetModel()
	if model == "" {
		defaultModel, err := ai.DefaultTranscriptionModel(provider.Type)
		if err != nil {
			return nil, status.Errorf(codes.InvalidArgument, "%v", err)
		}
		model = defaultModel
	}

	var text string
	switch provider.Type {
	case ai.ProviderOpenAI:
		text, err = s.transcribeViaSTT(ctx, provider, persisted, model, content, filename, contentType)
	case ai.ProviderGemini:
		text, err = s.transcribeViaAudioLLM(ctx, provider, persisted, model, content, contentType)
	default:
		return nil, status.Errorf(codes.FailedPrecondition,
			"provider type %q is not supported for transcription", provider.Type)
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to transcribe audio: %v", err)
	}
	return &v1pb.TranscribeResponse{Text: text}, nil
}

func (*APIV1Service) transcribeViaSTT(
	ctx context.Context,
	provider ai.ProviderConfig,
	persisted *storepb.TranscriptionConfig,
	model string,
	content []byte,
	filename string,
	contentType string,
) (string, error) {
	transcriber, err := sttopenai.New(provider, stt.ApplyOptions(nil))
	if err != nil {
		return "", errors.Wrap(err, "failed to create STT transcriber")
	}
	resp, err := transcriber.Transcribe(ctx, stt.Request{
		Audio:       bytes.NewReader(content),
		Size:        int64(len(content)),
		Filename:    filename,
		ContentType: contentType,
		Model:       model,
		Prompt:      persisted.GetPrompt(),
		Language:    persisted.GetLanguage(),
	})
	if err != nil {
		return "", err
	}
	return resp.Text, nil
}

func (*APIV1Service) transcribeViaAudioLLM(
	ctx context.Context,
	provider ai.ProviderConfig,
	persisted *storepb.TranscriptionConfig,
	model string,
	content []byte,
	contentType string,
) (string, error) {
	m, err := audiollmgemini.New(provider, audiollm.ApplyOptions(nil))
	if err != nil {
		return "", errors.Wrap(err, "failed to create audio LLM")
	}
	resp, err := m.GenerateFromAudio(ctx, audiollm.Request{
		Audio:        bytes.NewReader(content),
		Size:         int64(len(content)),
		ContentType:  contentType,
		Model:        model,
		Instructions: buildTranscriptionInstructions(persisted.GetPrompt(), persisted.GetLanguage()),
	})
	if err != nil {
		return "", err
	}
	if resp.FinishReason != audiollm.FinishStop {
		return "", errors.Errorf("transcription incomplete (finish reason: %s)", resp.FinishReason)
	}
	if strings.TrimSpace(resp.Text) == "" {
		return "", errors.New("transcription response did not include text")
	}
	return resp.Text, nil
}

const maxFormatMarkdownTextSizeBytes = 1 * MebiByte

// FormatMarkdown restructures plain text into markdown using an instance AI provider,
// preserving the original text content verbatim.
func (s *APIV1Service) FormatMarkdown(ctx context.Context, request *v1pb.FormatMarkdownRequest) (*v1pb.FormatMarkdownResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	text := request.GetText()
	if strings.TrimSpace(text) == "" {
		return nil, status.Errorf(codes.InvalidArgument, "text is required")
	}
	if len(text) > maxFormatMarkdownTextSizeBytes {
		return nil, status.Errorf(codes.InvalidArgument, "text is too large; maximum size is 1 MiB")
	}

	aiSetting, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get AI setting: %v", err)
	}
	providerID := aiSetting.GetDefaultProviderId()
	if providerID == "" {
		return nil, status.Errorf(codes.FailedPrecondition, "no default AI provider is configured")
	}
	provider, model, err := s.resolveAIProviderWithModel(aiSetting, providerID)
	if err != nil {
		return nil, err
	}

	instructions := "Reformat the user's plain text into well-structured Markdown. " +
		"The text was extracted from a PDF, so line breaks may be arbitrary. " +
		"Preserve the original text content completely and verbatim: do not add, remove, summarize, translate, or rephrase anything. " +
		"Only add Markdown structure: headings, lists, tables, emphasis, code blocks, and paragraph breaks where the original layout implies them. " +
		"The input contains lines that are exactly \"---\" on their own line. These are page separators between PDF pages. " +
		"You MUST keep every \"---\" separator exactly where it is, on its own line, and MUST NOT add any new \"---\" line anywhere else. " +
		"Do not use \"---\" (a thematic break / horizontal rule) for any other purpose in the formatted output; use headings or blank lines for section breaks instead. " +
		"Keep the original language. Return only the Markdown, with no surrounding explanation or code fence."
	if filename := strings.TrimSpace(request.GetFilename()); filename != "" {
		instructions += "\n\nThe source file is named: " + filename
	}

	markdown, err := ai.GenerateText(ctx, provider, model, instructions, text)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to format text: %v", err)
	}
	return &v1pb.FormatMarkdownResponse{Markdown: markdown}, nil
}

const maxPolishTextSizeBytes = 128 * 1024

// polishPresetInstructions maps a named preset to the rewrite goal appended to
// the shared polishing instructions. Keep the keys in sync with the frontend.
var polishPresetInstructions = map[string]string{
	"polish":  "Polish the text: improve clarity, flow, and word choice while keeping the meaning.",
	"concise": "Make the text more concise: remove redundancy and tighten the wording without dropping key information.",
	"expand":  "Expand the text: add detail and elaboration while staying faithful to the original intent.",
	"grammar": "Correct grammar, spelling, and punctuation. Change wording only as needed for correctness.",
	"tone":    "Adjust the tone to be more natural and appropriate while keeping the meaning.",
}

// PolishText rewrites a selected span of text following a preset or custom
// instruction, returning only the rewritten text.
func (s *APIV1Service) PolishText(ctx context.Context, request *v1pb.PolishTextRequest) (*v1pb.PolishTextResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	text := request.GetText()
	if strings.TrimSpace(text) == "" {
		return nil, status.Errorf(codes.InvalidArgument, "text is required")
	}
	if len(text) > maxPolishTextSizeBytes {
		return nil, status.Errorf(codes.InvalidArgument, "text is too large; maximum size is 128 KiB")
	}

	// The custom instruction wins; otherwise fall back to the named preset,
	// defaulting to a general polish.
	goal := strings.TrimSpace(request.GetInstruction())
	if goal == "" {
		preset := strings.TrimSpace(request.GetPreset())
		if preset == "" {
			preset = "polish"
		}
		presetGoal, ok := polishPresetInstructions[preset]
		if !ok {
			return nil, status.Errorf(codes.InvalidArgument, "unknown preset %q", preset)
		}
		goal = presetGoal
	}

	aiSetting, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get AI setting: %v", err)
	}
	providerID := aiSetting.GetDefaultProviderId()
	if providerID == "" {
		return nil, status.Errorf(codes.FailedPrecondition, "no default AI provider is configured")
	}
	provider, model, err := s.resolveAIProviderWithModel(aiSetting, providerID)
	if err != nil {
		return nil, err
	}

	instructions := "You rewrite a span of text that the user selected inside an editor. " +
		goal + " " +
		"Write the result in the same language as the selected text's main content, regardless of the language of this instruction. " +
		"Preserve the original meaning and any Markdown formatting. " +
		"Return only the rewritten text, with no surrounding explanation, quotes, or code fence."

	polished, err := ai.GenerateText(ctx, provider, model, instructions, text)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to polish text: %v", err)
	}
	return &v1pb.PolishTextResponse{Text: strings.TrimSpace(polished)}, nil
}

const maxFormulaPromptSizeBytes = 8 * 1024

// GenerateFormula turns a natural-language prompt into a single spreadsheet
// formula using an instance AI provider, returning only the formula string.
func (s *APIV1Service) GenerateFormula(ctx context.Context, request *v1pb.GenerateFormulaRequest) (*v1pb.GenerateFormulaResponse, error) {
	user, err := s.fetchCurrentUser(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get current user: %v", err)
	}
	if user == nil {
		return nil, status.Errorf(codes.Unauthenticated, "user not authenticated")
	}

	prompt := strings.TrimSpace(request.GetPrompt())
	if prompt == "" {
		return nil, status.Errorf(codes.InvalidArgument, "prompt is required")
	}
	if len(prompt) > maxFormulaPromptSizeBytes {
		return nil, status.Errorf(codes.InvalidArgument, "prompt is too large; maximum size is 8 KiB")
	}

	aiSetting, err := s.Store.GetInstanceAISetting(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get AI setting: %v", err)
	}
	providerID := aiSetting.GetDefaultProviderId()
	if providerID == "" {
		return nil, status.Errorf(codes.FailedPrecondition, "no default AI provider is configured")
	}
	provider, model, err := s.resolveAIProviderWithModel(aiSetting, providerID)
	if err != nil {
		return nil, err
	}

	// The renderer (x-spreadsheet) only evaluates the narrow grammar below;
	// anything else computes wrong or crashes its engine, so constrain the model.
	instructions := "You generate a formula for an x-spreadsheet grid embedded in a document. " +
		"The user selected one target cell and described what they want; you are given the sheet's current contents " +
		"as CSV only so you can address the right cells. Map CSV to cells by position: CSV line 1 is the header on " +
		"spreadsheet row 1 (cells A1, B1, C1, …); each later CSV line is the next row (line 2 -> row 2, line 3 -> row 3, " +
		"and so on for however many rows exist); within a line, comma-separated values fill columns A, B, C, … left to right. " +
		"Always refer to data by its A1 cell reference (e.g. B2, C2) — never paste a header name or a cell's literal value into the formula.\n" +
		"The formula computes the single value for that one target cell; it cannot reference the target cell itself (no self-reference). " +
		"An empty CSV value means an empty cell — not the string \"\", null, undefined, or 0; skip such cells rather than treating them as a value.\n" +
		"Output ONLY the formula on a single physical line with no line breaks, starting with '=', no quotes, explanation, or code fence " +
		"(commas are allowed only as function-argument separators, e.g. SUM(A1,A2)).\n" +
		"x-spreadsheet formula grammar:\n" +
		"- Refs: A1-style (columns A,B,C…, rows from 1); a cell range is A1:A3.\n" +
		"- Functions: NAME(arg,arg,…). Allowed ONLY: SUM, AVERAGE, MAX, MIN, PRODUCT, DIVIDE, SUBTRACT, CONCAT, IF, AND, OR. " +
		"Ranges may be passed to them, e.g. SUM(B2:B10).\n" +
		"- Arithmetic + - * / on single cells/numbers; */ bind before +-, parentheses allowed. E.g. B2*C2+B3*C3.\n" +
		"- Comparisons > < = >= <= only inside IF/AND/OR, e.g. IF(A1>10,\"y\",\"n\"). Text literals use double quotes; CONCAT joins them.\n" +
		"Forbidden: any other function (no SUMPRODUCT, VLOOKUP, COUNT, COUNTIF, ROUND…); arithmetic on ranges " +
		"(write B2*C2+B3*C3, never SUM(B2:B3*C2:C3))."

	userMessage := prompt
	if context := strings.TrimSpace(request.GetContext()); context != "" {
		userMessage = "Spreadsheet context:\n" + context + "\n\nRequest: " + prompt
	}

	formula, err := ai.GenerateText(ctx, provider, model, instructions, userMessage)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate formula: %v", err)
	}

	formula = normalizeFormula(formula)
	if formula == "" {
		return nil, status.Errorf(codes.Internal, "model did not return a formula")
	}
	// The renderer only survives formulas that stay inside the grammar it can
	// evaluate. A reply padded with prose, or one calling a function the engine
	// doesn't register, crashes x-spreadsheet mid-draw — reject it here so the
	// client shows a clean error instead of a blank/broken grid.
	if err := validateFormula(formula); err != nil {
		return nil, status.Errorf(codes.Internal, "model returned an invalid formula: %v", err)
	}
	return &v1pb.GenerateFormulaResponse{Formula: formula}, nil
}

// formulaAllowedFunctions is the exact set the renderer can evaluate: the eight
// functions x-spreadsheet builds in, plus PRODUCT/DIVIDE/SUBTRACT which the web
// client registers as fallbacks (see sheets/formulaPatch.ts). Any other
// identifier before a "(" means a function the engine can't resolve.
var formulaAllowedFunctions = map[string]bool{
	"SUM": true, "AVERAGE": true, "MAX": true, "MIN": true,
	"PRODUCT": true, "DIVIDE": true, "SUBTRACT": true,
	"CONCAT": true, "IF": true, "AND": true, "OR": true,
}

// formulaCharset is every character a well-formed formula may contain: A1 cell
// references, numbers, arithmetic/comparison operators, argument separators,
// and double-quoted string literals. Anything outside it (letters forming prose,
// punctuation, non-ASCII) marks a reply that isn't a bare formula.
var formulaCharset = regexp.MustCompile(`^=[A-Za-z0-9_+\-*/(),.:<>=%$ "]+$`)

// formulaStringLiteralRe matches a double-quoted text literal. Literals are the
// one place arbitrary words are legal, so they are blanked out before the
// identifier scan below rather than being parsed.
var formulaStringLiteralRe = regexp.MustCompile(`"[^"]*"`)

// formulaIdentRe matches an identifier plus, if present, the "(" that makes it a
// function call. The trailing group is what distinguishes a call (SUM() -> must
// be an allowed function) from a bare word (B2 -> must be a cell reference).
// "$" is part of the identifier so an absolute reference ($A$1) stays one token.
var formulaIdentRe = regexp.MustCompile(`(\$?[A-Za-z][A-Za-z0-9_$]*)\s*(\()?`)

// formulaCellRefRe matches an A1-style cell reference, the only bare identifier
// a formula may contain outside a function name or a quoted literal. Applied
// after the "$" absolute-reference markers have been stripped.
var formulaCellRefRe = regexp.MustCompile(`^[A-Za-z]{1,3}[0-9]+$`)

// formulaBareWords are the non-reference bare identifiers the grammar allows.
var formulaBareWords = map[string]bool{"TRUE": true, "FALSE": true}

// validateFormula rejects anything the x-spreadsheet renderer can't safely
// evaluate: content outside the formula charset, a call to a function it doesn't
// implement, or a bare word that is neither a cell reference nor a boolean
// literal. That last check is what catches a model that answered in prose
// ("=Sorry I cannot do that"), which the charset alone lets through since it
// permits the letters and spaces a cell reference and a sentence share.
func validateFormula(formula string) error {
	if !strings.HasPrefix(formula, "=") {
		return errors.New("formula must start with '='")
	}
	if !formulaCharset.MatchString(formula) {
		return errors.New("formula contains characters outside the supported grammar")
	}
	// Blank out text literals so words inside them aren't read as identifiers.
	// Replacing (rather than deleting) keeps offsets and adjacency intact.
	scannable := formulaStringLiteralRe.ReplaceAllStringFunc(formula, func(lit string) string {
		return strings.Repeat(" ", len(lit))
	})
	if strings.Count(scannable, `"`) > 0 {
		return errors.New("formula has an unterminated text literal")
	}
	for _, m := range formulaIdentRe.FindAllStringSubmatch(scannable, -1) {
		bare := strings.ReplaceAll(m[1], "$", "")
		name := strings.ToUpper(bare)
		if m[2] == "(" {
			if !formulaAllowedFunctions[name] {
				return errors.Errorf("unsupported function %q", name)
			}
			continue
		}
		if formulaBareWords[name] || formulaCellRefRe.MatchString(bare) {
			continue
		}
		return errors.Errorf("unexpected word %q: not a cell reference or supported function", m[1])
	}
	return nil
}

// normalizeFormula strips code fences / surrounding whitespace the model may add
// and guarantees the result starts with '='.
func normalizeFormula(raw string) string {
	text := strings.TrimSpace(raw)
	// Drop a wrapping ```...``` fence if the model added one.
	if strings.HasPrefix(text, "```") {
		text = strings.Trim(text, "`")
		if idx := strings.IndexByte(text, '\n'); idx != -1 {
			// Skip a leading language tag line (e.g. "excel").
			if !strings.Contains(text[:idx], "=") {
				text = text[idx+1:]
			}
		}
		text = strings.TrimSpace(text)
	}
	// Keep only the first non-empty line.
	if idx := strings.IndexByte(text, '\n'); idx != -1 {
		text = strings.TrimSpace(text[:idx])
	}
	if text == "" {
		return ""
	}
	if !strings.HasPrefix(text, "=") {
		text = "=" + text
	}
	return text
}

// resolveAIProviderWithModel resolves a provider and picks a usable chat model for it:
// the provider's first manually-configured model, or a built-in default for Gemini.
func (s *APIV1Service) resolveAIProviderWithModel(setting *storepb.InstanceAISetting, providerID string) (ai.ProviderConfig, string, error) {
	provider, err := s.resolveAIProvider(setting, providerID)
	if err != nil {
		return ai.ProviderConfig{}, "", err
	}
	for _, p := range setting.GetProviders() {
		if p.GetId() != providerID {
			continue
		}
		for _, m := range p.GetModels() {
			if m.GetId() != "" {
				return provider, m.GetId(), nil
			}
		}
	}
	if provider.Type == ai.ProviderGemini {
		return provider, ai.DefaultGeminiTranscriptionModel, nil
	}
	return ai.ProviderConfig{}, "", status.Errorf(codes.FailedPrecondition, "no model is configured for the default AI provider")
}

func buildTranscriptionInstructions(prompt, language string) string {
	parts := []string{
		"Transcribe the audio accurately. Return only the transcript text. " +
			"Do not summarize, explain, or add content that is not spoken.",
	}
	if language = strings.TrimSpace(language); language != "" {
		parts = append(parts, "The input language is "+language+".")
	}
	if prompt = strings.TrimSpace(prompt); prompt != "" {
		parts = append(parts, "Context and spelling hints:\n"+prompt)
	}
	return strings.Join(parts, "\n\n")
}

func (*APIV1Service) resolveAIProvider(setting *storepb.InstanceAISetting, providerID string) (ai.ProviderConfig, error) {
	providers := make([]ai.ProviderConfig, 0, len(setting.GetProviders()))
	for _, provider := range setting.GetProviders() {
		if provider == nil {
			continue
		}
		providers = append(providers, convertAIProviderConfigFromStore(provider))
	}

	provider, err := ai.FindProvider(providers, providerID)
	if err != nil {
		return ai.ProviderConfig{}, status.Errorf(codes.FailedPrecondition, "transcription provider is not configured")
	}
	return *provider, nil
}

func convertAIProviderConfigFromStore(provider *storepb.AIProviderConfig) ai.ProviderConfig {
	return ai.ProviderConfig{
		ID:       provider.GetId(),
		Title:    provider.GetTitle(),
		Type:     convertAIProviderTypeFromStore(provider.GetType()),
		Endpoint: provider.GetEndpoint(),
		APIKey:   provider.GetApiKey(),
	}
}

func convertAIProviderTypeFromStore(providerType storepb.AIProviderType) ai.ProviderType {
	switch providerType {
	case storepb.AIProviderType_OPENAI:
		return ai.ProviderOpenAI
	case storepb.AIProviderType_GEMINI:
		return ai.ProviderGemini
	default:
		return ""
	}
}

func isSupportedTranscriptionContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(contentType))
	if err != nil {
		return false
	}
	mediaType = strings.ToLower(mediaType)
	return supportedTranscriptionContentTypes[mediaType]
}
