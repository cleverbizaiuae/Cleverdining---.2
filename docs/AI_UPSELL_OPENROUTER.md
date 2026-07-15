# AI Upsell on OpenRouter Free Models

## Production architecture

```text
Customer action
  -> Django rules, exclusions, and business constraints
  -> deterministic 3-5 item shortlist
  -> OpenRouter free model judges the shortlist and writes short copy
  -> Django validates the returned item ID against the shortlist
  -> deterministic top-ranked fallback on any LLM failure
```

The LLM never controls stock, eligibility, pricing, discounts, payments,
session caps, or delivery. It cannot select an item outside the backend
shortlist.

## Configuration

```env
UPSELL_LLM_ENABLED=True
UPSELL_LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-secret-api-key
OPENROUTER_UPSELL_MODEL=openrouter/free
OPENROUTER_UPSELL_TIMEOUT_SECONDS=3.0
OPENROUTER_UPSELL_MAX_OUTPUT_TOKENS=220
```

The API key must be stored only in the backend host's secret environment. It
must never be committed or exposed to either frontend.

## Cost and reliability controls

- `openrouter/free` routes only to zero-cost model variants.
- There is no fallback to a paid OpenRouter model.
- OpenRouter free-tier rate limits apply.
- Requests time out quickly and fall back deterministically.
- Output is capped at 220 tokens.
- The backend sends at most five already-valid candidates.
- Invalid JSON and out-of-shortlist item IDs are rejected.

Free-model availability and latency are not guaranteed. The deterministic
engine remains the production reliability path.
