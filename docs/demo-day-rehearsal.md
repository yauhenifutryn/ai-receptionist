# Demo Day Rehearsal — 30 May 2026, Rotunda

Operational runbook for the live stage demo. Read once before rehearsal, re-read morning of. Update with concrete details (clinic name, volunteer phone, exact agent IDs) once finalized.

## What we're demoing

A Polish dental receptionist that books appointments from a live cold call. A volunteer from the audience dials a real phone number, talks to the agent in Polish, ends the call with a confirmed booking, receives an SMS, and we show the operator dashboard updating live in the same minute.

## Stage flow

Roughly 5 minutes on stage. Fill in concrete names and timings during rehearsal.

1. Sebastian opens with the pain point — 30s on lost calls / no-shows / Polish reception bottleneck.
2. Operator pulls up the agent dashboard on the projector (the demo clinic's `/test/[agentId]`).
3. Volunteer dials the agent's number from a personal phone (their actual phone, not ours).
4. Conversation runs in Polish: greeting, RODO consent, service ask, slot offer, confirm. Real booking gets written to the database.
5. SMS confirmation lands on the volunteer's phone within ~30 seconds. They hold the phone up.
6. We switch the projector to the operator dashboard's Conversations page; the just-finished call appears with transcript, tool trace, and booking row populated.

## Failure modes and mitigations

- **Zadarma not verified by Demo Day.** Use the in-browser PIN demo URL projected as a QR code. Volunteer scans, joins via `@elevenlabs/react` widget. Audience still gets a live Polish conversation; we lose the "SMS landing on a real phone" beat but keep the rest. Have the QR printed *and* available on the projector laptop.
- **Agent fumbles a question on stage.** Don't panic. Pivot to the operator dashboard: open the just-finished call, point at the transcript line where it went sideways, point at the tool trace, narrate "this is exactly what the clinic sees the next morning when they review yesterday's calls." Recovery via transparency.
- **Vercel deploy is sick.** Roll back to the previous production deployment URL. Keep that URL bookmarked on the laptop and printed on paper. Vercel CLI is on the laptop with the project linked, so `vercel rollback` works as a fallback.
- **Mic/audio fails during the live PSTN call.** Cut to the 90-second pre-recorded backup video (see "Backup demo material" below).
- **Network on stage is unreliable.** Tether the projector laptop to a personal phone hotspot. Test on the actual venue WiFi during rehearsal; if it's flaky, default to tether.
- **Volunteer no-shows or the audience freezes.** Have Patryk in the front row as a pre-arranged backup volunteer.

## Pre-flight checklist (morning of)

1. Agent provisioned for the demo clinic. Real services, real prices, real hours. Verified by an internal test call.
2. PIN generated for the in-browser demo URL. Tested end-to-end in an incognito window.
3. Demo URL printed as a QR code on at least two pieces of paper (laptop bag + Sebastian's pocket).
4. Operator dashboard logged-in on the projector laptop. Session refreshed within the last hour. Magic-link backup credentials in a sealed envelope.
5. Phone number verified end-to-end. Call it from a non-team phone the night before; full booking must complete and SMS must land.
6. SMS sender ID and template verified. Polish text reads naturally to a native speaker; no English phrases leaked through.
7. Owner-invite email drafted and tested on a friendly clinic — used for the "and they can do this themselves on day 2" line. Don't send live during the demo; show the email mid-composition.
8. Backup pre-recorded demo video on the laptop *and* on a USB stick. Tested with the venue's projector.
9. Previous production deploy URL bookmarked and printed. Vercel CLI authenticated.
10. Phone fully charged, brightness maxed, do-not-disturb on except for the demo number. Backup phone in the bag.

## What we measure live

The operator stats strip on `/test/[agentId]` already shows:

- 7-day call count.
- Average call duration.
- Booked count.
- Conversion %.

Don't add extra widgets for the demo; the strip is the point. Mention the numbers in passing during the dashboard reveal.

## Backup demo material

A 90-second pre-recorded video of a successful PSTN call from start to SMS landing. Record once Zadarma clears (final-week task). Stored locally and on a USB stick; do *not* rely on YouTube embed or Vercel-hosted asset during the demo. Cue point set at the start of the agent's first message so we can hit play and start narrating immediately.

## Open items to fill in before Demo Day

- Demo clinic name and agent ID.
- Volunteer's role (audience vs pre-arranged) and phone country if not Polish.
- Exact Polish first-message greeting being used.
- Final Sebastian opener wording (1-2 sentences).
- Specific previous production deploy URL we're falling back to.
