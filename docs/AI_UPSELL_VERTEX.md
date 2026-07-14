# AI Upsell on Google Cloud Vertex AI

## Production architecture

```text
Customer action
  -> Django rules, cart analysis, exclusions, and business rules
  -> deterministic 3-5 item shortlist
  -> Vertex AI gpt-oss-20b judges the shortlist and writes short copy
  -> Django validates the selected item ID
  -> frontend displays only the validated result
```

The model never owns stock checks, category eligibility, session caps, pricing,
discounts, payment logic, or frontend behavior. If Vertex AI is unavailable,
slow, or returns an invalid item, the deterministic top-ranked candidate is
used immediately.

## Why Vertex MaaS

Production uses `openai/gpt-oss-20b-maas`, an Apache 2.0 open-weight model
served by Google Cloud Vertex AI. MaaS has no always-on GPU or idle instance.
Billing is token-based, and this integration caps output at 220 tokens.

Do not deploy the Cloud Run GPU/Ollama alternative for normal production
traffic unless usage becomes high enough that dedicated compute is cheaper.

## Google Cloud setup

1. Select the production Google Cloud project with billing enabled.
2. Enable `aiplatform.googleapis.com`.
3. Enable the `gpt-oss-20b` API Service model in Model Garden.
4. Create a dedicated service account with only `Vertex AI User`.
5. Store its JSON key only in the backend host's secret environment.
6. Add a small monthly budget and alerts in Google Cloud Billing.

## Backend environment

```env
UPSELL_LLM_ENABLED=True
UPSELL_LLM_PROVIDER=vertex
VERTEX_UPSELL_PROJECT_ID=your-project-id
VERTEX_UPSELL_LOCATION=us-central1
VERTEX_UPSELL_MODEL=openai/gpt-oss-20b-maas
VERTEX_UPSELL_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
VERTEX_UPSELL_TIMEOUT_SECONDS=3.0
VERTEX_UPSELL_MAX_OUTPUT_TOKENS=220
```

`VERTEX_UPSELL_SERVICE_ACCOUNT_JSON` is a secret. Never commit it. The Django
service needs no Google credentials when the model is disabled.

## Cost controls

- MaaS avoids idle GPU charges and charges only for tokens used.
- The backend sends at most five prefiltered candidates.
- Output is capped at 220 tokens.
- The model is called only after session and candidate checks pass.
- A three-second timeout prevents inference from blocking ordering.
- Google Cloud budget alerts should be configured for the production project.

## Optional local provider

For local development only, set `UPSELL_LLM_PROVIDER=ollama` and configure the
existing `OLLAMA_*` variables. Production should remain on Vertex MaaS.

## Verification

1. A cart with candidates reports `llm_status: ok`, `decision_source: llm`,
   `llm_provider: vertex_maas`, and the configured model.
2. Removing credentials still returns a deterministic candidate promptly.
3. A returned item outside the shortlist is rejected.
4. Complete carts can return no suggestion.
5. Existing payment, discount, cart, and session flows remain independent of
   the model provider.
