// Package rag implements retrieval-augmented search over memo content: content
// chunking, the async index worker, and hybrid (full-text + vector) retrieval.
package rag

import (
	"strings"
	"unicode/utf8"
)

const (
	// targetChunkRunes is the soft upper bound for a chunk's length. Oversized
	// sections are split further to stay well within embedding input limits.
	targetChunkRunes = 450
	// overlapRunes is how much trailing context is repeated at the start of the
	// next slice when a long section is split, to avoid losing meaning at cuts.
	overlapRunes = 50
	// minChunkRunes avoids emitting tiny fragments; sections shorter than this
	// are merged with the previous chunk when possible.
	minChunkRunes = 12
)

// Chunk is a fragment of a memo's content, in document order.
type Chunk struct {
	Index   int
	Content string
}

// ChunkMarkdown splits Markdown content into chunks. Primary boundaries are
// Markdown headings (a heading starts a new section); sections longer than
// targetChunkRunes are split further by paragraph/character with a small overlap.
func ChunkMarkdown(content string) []Chunk {
	content = strings.ReplaceAll(content, "\r\n", "\n")
	sections := splitByHeadings(content)

	var pieces []string
	for _, section := range sections {
		section = strings.TrimRight(section, "\n")
		if strings.TrimSpace(section) == "" {
			continue
		}
		if utf8.RuneCountInString(section) <= targetChunkRunes {
			pieces = append(pieces, strings.TrimSpace(section))
			continue
		}
		pieces = append(pieces, splitLongSection(section)...)
	}

	// Merge runt fragments into their predecessor to avoid noise.
	var merged []string
	for _, p := range pieces {
		if len(merged) > 0 && utf8.RuneCountInString(p) < minChunkRunes {
			merged[len(merged)-1] += "\n" + p
			continue
		}
		merged = append(merged, p)
	}

	chunks := make([]Chunk, 0, len(merged))
	for i, p := range merged {
		chunks = append(chunks, Chunk{Index: i, Content: p})
	}
	return chunks
}

// splitByHeadings breaks content into sections that each begin at a Markdown
// ATX heading (#, ##, ...). Content before the first heading forms its own section.
func splitByHeadings(content string) []string {
	lines := strings.Split(content, "\n")
	var sections []string
	var current []string
	flush := func() {
		if len(current) > 0 {
			sections = append(sections, strings.Join(current, "\n"))
			current = nil
		}
	}
	for _, line := range lines {
		if isHeading(line) {
			flush()
		}
		current = append(current, line)
	}
	flush()
	return sections
}

func isHeading(line string) bool {
	trimmed := strings.TrimLeft(line, " ")
	if !strings.HasPrefix(trimmed, "#") {
		return false
	}
	i := 0
	for i < len(trimmed) && trimmed[i] == '#' {
		i++
	}
	return i >= 1 && i <= 6 && i < len(trimmed) && trimmed[i] == ' '
}

// splitLongSection splits an oversized section into overlapping pieces on
// paragraph boundaries where possible, falling back to rune windows.
func splitLongSection(section string) []string {
	paragraphs := strings.Split(section, "\n\n")
	var pieces []string
	var buf strings.Builder
	bufRunes := 0
	flush := func() {
		if bufRunes > 0 {
			pieces = append(pieces, strings.TrimSpace(buf.String()))
			buf.Reset()
			bufRunes = 0
		}
	}
	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}
		paraRunes := utf8.RuneCountInString(para)
		if paraRunes > targetChunkRunes {
			flush()
			pieces = append(pieces, splitByRunes(para)...)
			continue
		}
		if bufRunes+paraRunes > targetChunkRunes {
			flush()
		}
		if bufRunes > 0 {
			buf.WriteString("\n\n")
		}
		buf.WriteString(para)
		bufRunes += paraRunes
	}
	flush()
	return pieces
}

// splitByRunes windows text into overlapping fixed-size rune slices.
func splitByRunes(text string) []string {
	runes := []rune(text)
	var pieces []string
	step := targetChunkRunes - overlapRunes
	if step <= 0 {
		step = targetChunkRunes
	}
	for start := 0; start < len(runes); start += step {
		end := start + targetChunkRunes
		if end > len(runes) {
			end = len(runes)
		}
		pieces = append(pieces, strings.TrimSpace(string(runes[start:end])))
		if end == len(runes) {
			break
		}
	}
	return pieces
}
