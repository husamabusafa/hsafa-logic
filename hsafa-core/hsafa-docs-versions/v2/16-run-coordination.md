# 16 — Run Coordination

## Core Idea

An AI agent should behave like **one mind**, even when it has multiple runs active simultaneously. Every run can see all other active runs — their triggers, purposes, and progress — so the agent always has a complete picture before acting.

---

## What Each Run Sees

Every run's context includes an **ACTIVE RUNS** block:

```
ACTIVE RUNS:
  - Run A (this run) — Husam: "Tell Muhammad the meeting is at 3pm"
  - Run B (running)  — Husam: "Also tell him don't forget the documents"
  - Run C (running)  — Ahmad: "Check the deployment status"
```

The agent knows:
- **Which run it is** (`this run`)
- **What other runs are doing** (their triggers and purposes)
- **Whether runs are related** (same space, same topic, same requester)

---

## The Tool: `absorb_run`

When a run sees another run with a **related purpose**, it can absorb it:

```
absorb_run({ runId: "run-a-id" })
```

This does three things:
1. **Cancels** the target run (LLM generation aborted immediately)
2. **Returns** the target's full snapshot — trigger context + every action it took
3. The absorbing run now handles **both purposes** as one coherent action

### What the snapshot looks like

```json
{
  "absorbed": {
    "trigger": {
      "senderName": "Husam",
      "messageContent": "Tell Muhammad the meeting is at 3pm"
    },
    "actionsTaken": [
      { "tool": "send_message", "input": { "text": "Meeting at 3pm." } }
    ]
  }
}
```

`actionsTaken` may be empty (caught the run before it did anything) or contain tool calls (the run already acted). The absorbing run adapts accordingly.

---

## Decision Logic

The agent reasons through this naturally:

| Situation | Action |
|-----------|--------|
| Other run has **same/related purpose** | Absorb it → handle everything in one action |
| Other run has **different purpose** | Leave it alone → both proceed independently |
| Other run **already completed** | Can't absorb → read space history to see what it did |
| Absorbed run **already sent messages** | Supplement instead of repeat |

---

## Rules

- **Same agent only** — can't absorb another agent's runs
- **Active runs only** — can't absorb completed or canceled runs
- **Latest trigger absorbs** — prompt guidance: the newest run takes charge
- **First caller wins** — if two runs race to absorb each other, optimistic locking picks one; the other gets an error and proceeds independently

---

## Why This Works

The agent doesn't need special coordination logic. It just reads its ACTIVE RUNS, reasons about whether runs are related, and acts. The LLM is already good at this — it's the same kind of reasoning a human does when they get two related messages and think "let me handle both at once."

No debounce timers. No gateway-level batching. No delay on any trigger. Every message triggers a run immediately, and **the agent itself decides** how to coordinate.
