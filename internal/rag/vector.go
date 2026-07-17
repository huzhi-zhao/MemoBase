package rag

import "math"

// cosine returns the cosine similarity of two equal-length vectors. It returns 0
// when either vector has zero magnitude. Callers guarantee len(a) == len(b).
func cosine(a, b []float32) float64 {
	var dot, na, nb float64
	for i := range a {
		av, bv := float64(a[i]), float64(b[i])
		dot += av * bv
		na += av * av
		nb += bv * bv
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
