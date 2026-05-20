# ElevenLabs Analysis Setup

How to wire up automatic evaluation criteria on an ElevenLabs ConvAI agent. Each criterion scores every completed call (LLM-as-judge over the transcript) and the result lands in our database with no extra plumbing.

## Why

The voice runtime returns a call transcript on every post-call webhook, but raw transcripts aren't review-friendly at scale. EL's Analysis feature attaches a small set of yes/no/score questions ("criteria") that an LLM runs against each transcript after the call ends. Result: every conversation row in our database carries a graded summary, so operators can sort, filter, and triage instead of reading every call.

Results land at `conversations.raw_jsonb.analysis` (we already ingest the whole `raw_jsonb` from the post-call webhook). No migration, no code change, no agent-side prompt change.

## Where the criteria live

In the EL JSON: `platform_settings.evaluation.criteria` — an array. Empty by default. Configured exclusively via the EL dashboard UI; there is no API.

## Walkthrough

1. Open the ElevenLabs dashboard → Conversational AI → Agents.
2. Pick the agent you want to score. (Operator dashboard exposes the agent ID as `provider_agent_id`.)
3. Open the "Analysis" tab.
4. Click "Add criterion".
5. Give the criterion a short slug, a one-paragraph definition, and pick its output type (boolean is easiest to chart).
6. Save. The criterion is live immediately for new calls (does not retro-score old ones).
7. Place a test call. Check the resulting conversation row in Supabase or via the operator dashboard; `raw_jsonb.analysis` should now contain a key per criterion.
8. Add 3-5 criteria total. More is noise; fewer leaves blind spots.
9. After 20-30 real calls, sanity-check the scores against the transcripts. Tighten the criterion definitions if the model is too lenient or too strict.

## Suggested starter criteria (Polish dental)

Three criteria cover the highest-leverage failure modes for a Polish dental receptionist:

1. **Medical escalation correctness.** "Did the agent correctly escalate to a human when the caller mentioned symptoms suggesting a medical emergency (severe pain, swelling, trauma, bleeding that won't stop)?" — boolean. The agent is supposed to escalate, never improvise medical advice; this catches improvisation drift.

2. **RODO consent capture.** "Did the agent confirm RODO consent before collecting any personal data, and did the caller agree?" — boolean. Required by Polish data law; a single missed consent is a compliance risk.

3. **Booking outcome.** "Did the call end with a confirmed appointment booking (date, time, service, patient name on file)?" — boolean. Tracks our north-star conversion metric independent of the booking tool's success flag.

Add more once these three are stable: politeness/tone, accent-language confusion handling, after-hours redirect correctness, etc.

## Operator workflow

- The `/test/[agentId]` page surfaces a status card showing whether criteria are configured and the count. Use it as a pre-call sanity check before handing an agent to a clinic.
- Filter conversations by criterion score directly in Supabase until the operator dashboard exposes a UI filter (post-Demo Day).

## Notes

- Analysis is asynchronous; it can lag a few seconds behind the post-call webhook. The first webhook may land before `raw_jsonb.analysis` is populated; EL retries with the analysis attached.
- Criteria changes only affect future calls.
- Criterion definitions are part of the agent config; cloning an agent does not clone criteria. Re-add manually after each clone.
