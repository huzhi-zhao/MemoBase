package v1

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// The generated formula is fed straight into x-spreadsheet's evaluator, which
// throws mid-draw on anything outside the grammar it implements. These cases pin
// down where validateFormula draws the line.
func TestValidateFormula(t *testing.T) {
	t.Parallel()

	valid := []string{
		"=SUM(B2:B10)",
		"=B2*C2+B3*C3",
		"=IF(A1>10,\"yes\",\"no\")",
		"=AVERAGE(A1,A2,A3)",
		"=CONCAT(A1,\" and \",B1)",
		"=(A1+B1)/2",
		"=SUM(B2:B10)*0.15",
		"=IF(AND(A1>1,B1<5),TRUE,FALSE)",
		"=MAX($A$1:$A$9)",
		"=SUM(AA1:AA9)",
	}
	for _, formula := range valid {
		require.NoErrorf(t, validateFormula(formula), "expected %q to be accepted", formula)
	}

	invalid := map[string]string{
		// A model that answered in prose instead of emitting a formula. The charset
		// alone lets these through — they only contain letters and spaces, which a
		// cell reference needs too — so the bare-word check is what catches them.
		"=Sorry I cannot do that": "prose reply",
		"=SUM of column B":        "half-prose reply",
		"=A1 plus B1":             "operator written as a word",
		"The formula is =SUM(A1)": "missing leading '='",
		// Functions x-spreadsheet's engine does not register.
		"=VLOOKUP(A1,B1:C9,2)":   "unsupported function",
		"=COUNTIF(A1:A9,\">1\")": "unsupported function",
		"=ROUND(A1,2)":           "unsupported function",
		// A literal that never closes would hide everything after it from the scan.
		"=CONCAT(\"unterminated": "unterminated literal",
	}
	for formula, reason := range invalid {
		require.Errorf(t, validateFormula(formula), "expected %q to be rejected (%s)", formula, reason)
	}
}

func TestNormalizeFormula(t *testing.T) {
	t.Parallel()

	require.Equal(t, "=SUM(A1:A9)", normalizeFormula("=SUM(A1:A9)"))
	require.Equal(t, "=SUM(A1:A9)", normalizeFormula("  =SUM(A1:A9)\n"))
	// A bare formula with no '=' gets one.
	require.Equal(t, "=SUM(A1:A9)", normalizeFormula("SUM(A1:A9)"))
	// Fenced replies, with and without a language tag.
	require.Equal(t, "=SUM(A1:A9)", normalizeFormula("```\n=SUM(A1:A9)\n```"))
	require.Equal(t, "=SUM(A1:A9)", normalizeFormula("```excel\n=SUM(A1:A9)\n```"))
	// Only the first line survives, so trailing commentary is dropped.
	require.Equal(t, "=SUM(A1:A9)", normalizeFormula("=SUM(A1:A9)\nThis adds up column A."))
	require.Equal(t, "", normalizeFormula("   "))
}
