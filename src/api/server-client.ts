/**
 * HTTP client for the running kt/SGLang server.
 * Polls /metrics (Prometheus text format) for throughput data.
 */

interface ThroughputSnapshot {
  prefill: number  // tokens/s
  decode: number   // tokens/s
  timestamp: string
}

export async function fetchServerMetrics(baseUrl: string): Promise<ThroughputSnapshot | null> {
  try {
    const response = await fetch(`${baseUrl}/metrics`, { signal: AbortSignal.timeout(2000) })
    if (!response.ok) return null
    const text = await response.text()
    return parsePrometheusMetrics(text)
  } catch {
    return null
  }
}

export async function fetchServerModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) })
    if (!response.ok) return []
    const data = await response.json()
    return (data.data || []).map((m: any) => m.id)
  } catch {
    return []
  }
}

function parsePrometheusMetrics(text: string): ThroughputSnapshot {
  const lines = text.split('\n')
  let prefill = 0
  let decode = 0

  for (const line of lines) {
    if (line.startsWith('#')) continue
    // SGLang metrics examples:
    // sglang:prefill_throughput_tokens_per_s 1234.5
    // sglang:decode_throughput_tokens_per_s 567.8
    const prefillMatch = line.match(/sglang[_:]prefill_throughput[^\s]*\s+([\d.]+)/)
    const decodeMatch = line.match(/sglang[_:]decode_throughput[^\s]*\s+([\d.]+)/)
    // Also try num_tokens_generated / time patterns
    const genMatch = line.match(/sglang[_:]token_usage[^\s]*\s+([\d.]+)/)

    if (prefillMatch) prefill = parseFloat(prefillMatch[1])
    if (decodeMatch) decode = parseFloat(decodeMatch[1])
  }

  return {
    prefill,
    decode,
    timestamp: new Date().toLocaleTimeString()
  }
}
