package rag

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestChunkMarkdownSplitsByHeadings(t *testing.T) {
	content := "# Title\n\nIntro paragraph.\n\n## Section A\n\nContent A.\n\n## Section B\n\nContent B."
	chunks := ChunkMarkdown(content)
	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d: %+v", len(chunks), chunks)
	}
	if !strings.Contains(chunks[1].Content, "Section A") {
		t.Errorf("chunk 1 should contain Section A: %q", chunks[1].Content)
	}
	for i, c := range chunks {
		if c.Index != i {
			t.Errorf("chunk %d has index %d", i, c.Index)
		}
	}
}

func TestChunkMarkdownSplitsLongSection(t *testing.T) {
	long := strings.Repeat("这是一段很长的中文内容。", 200) // ~2000 runes, single section
	chunks := ChunkMarkdown(long)
	if len(chunks) < 2 {
		t.Fatalf("expected long content to split, got %d chunks", len(chunks))
	}
	for _, c := range chunks {
		if n := utf8.RuneCountInString(c.Content); n > targetChunkRunes+overlapRunes {
			t.Errorf("chunk too long: %d runes", n)
		}
	}
}

func TestChunkMarkdownEmpty(t *testing.T) {
	if chunks := ChunkMarkdown("   \n\n  "); len(chunks) != 0 {
		t.Errorf("expected no chunks for blank content, got %d", len(chunks))
	}
}
