# Client Tool Calling (Browser + Node.js)

Client tools are tools with no server-side `execute` function. The LLM decides to call the tool, the gateway pauses the run, and the **client** (browser or Node.js backend) provides the result.

Client tools attach as `tool_call` parts to the run's **composite message** (see [Composite Messages & Tool Visibility](./05-space-ui.md)). By default they appear in the trigger space, but the agent can route them to any space using `targetSpaceId` or `targetSpaceIds` — these fields are **auto-injected** by the gateway into every tool's input schema at build time. The tool creator never adds them, and the gateway strips them before passing args to `execute`.

## How It Works

```
LLM → tool-call (no server execute) → stream ends
  → gateway sets run status: waiting_tool
  → emits run.waiting_tool via SSE
  → client receives tool call, executes it
  → client submits result via REST: POST /api/runs/{runId}/tool-results
  → gateway resumes run with tool result injected into model messages
  → LLM sees tool-call + result → continues generating
```

---

## Browser Client (React SDK)

Two patterns:

### Pattern A: Auto-Submit (Programmatic)

The React app registers a handler. When the tool is called, the handler runs automatically and submits the result.

```tsx
<HsafaChatProvider
  clientTools={{
    getUserLocation: async ({ input }) => {
      // Runs automatically when agent calls getUserLocation
      const pos = await navigator.geolocation.getCurrentPosition();
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    },
    fetchBrowserData: async ({ input }) => {
      // Access browser APIs, local storage, DOM, etc.
      return { theme: document.documentElement.dataset.theme };
    },
  }}
>
```

**Flow:**
1. Agent calls `getUserLocation`
2. `useHsafaRuntime` buffers the tool call
3. `run.waiting_tool` fires → handler executes → result auto-submitted
4. Run resumes, agent continues with location data

### Pattern B: Manual Submit (Interactive UI)

The tool renders inline in the chat thread. The user interacts with it (clicks a button, fills a form). The component submits the result when ready.

```tsx
// In the thread component — register a custom UI for the tool
<MessagePrimitive.Parts
  tools={{
    by_name: {
      showProductCard: ProductCardComponent, // Renders inline
      approveAction: ApprovalButtonComponent,
    },
  }}
/>
```

```tsx
// ProductCardComponent
function ProductCard({ args, result, status }) {
  const { submitToRun } = useToolResult();
  const runId = useMessage(m => m.id); // runId during streaming

  if (result) return <div>✓ Selected: {result.choice}</div>;

  return (
    <div className="product-card">
      <h3>{args.productName}</h3>
      <p>{args.description}</p>
      <button onClick={() => submitToRun(runId, {
        callId: args.toolCallId,
        result: { choice: 'selected', productId: args.productId }
      })}>
        Select This Product
      </button>
    </div>
  );
}
```

**Flow:**
1. Agent calls `showProductCard` with product data
2. Run pauses (`waiting_tool`)
3. Product card renders inline in the chat thread
4. User clicks "Select" → `submitToRun()` sends result to gateway
5. Run resumes, agent sees `{ choice: 'selected', productId: '...' }`

---

## Node.js Client (Node SDK)

Same REST API, no React needed. A Node.js backend can subscribe to an agent's runs and handle client tools.

**Setup:**
- Pipeline-Agent has a tool: `runSqlQuery` configured as client tool (`execution.mode: "no-execution"`)
- Node.js backend subscribes to the agent's runs and handles `runSqlQuery`
- Airflow triggers the agent directly via the service trigger API (Airflow is NOT an entity)

**Flow:**

```
Airflow calls POST /api/agents/{pipelineAgentId}/trigger
  payload: { event: "dag_failed", dagId: "etl_daily", task: "load_users" }

1. Gateway creates GENERAL RUN for Pipeline-Agent
   Trigger: { type: "service", serviceName: "Airflow", payload: { event: "dag_failed", ... } }

2. Agent reasons: "ETL failed, let me check the data"
3. Agent calls runSqlQuery({ sql: "SELECT count(*) FROM staging.users WHERE loaded_at > NOW() - INTERVAL '1 hour'" })
   → No server execute → run pauses (waiting_tool)

4. Node.js backend receives run.waiting_tool via SSE (subscribed to the agent's runs):
   const stream = client.runs.subscribe(runId);
   stream.on('run.waiting_tool', async (event) => {
     for (const tc of event.data.pendingToolCalls) {
       if (tc.toolName === 'runSqlQuery') {
         const result = await warehouse.query(tc.input.sql);
         await client.tools.submitRunResult(event.data.runId, {
           callId: tc.toolCallId,
           result: { rows: result.rows, rowCount: result.rowCount },
         });
       }
     }
   });

5. Gateway resumes run with query result
6. Agent calls sendSpaceMessage(dataOpsSpace, "The ETL task failed — the staging.users table has 0 rows loaded in the last hour. The source connection appears to be down.")
   → streams into Data Ops space (real LLM tokens)
```

No browser involved. The "client" is a Node.js process using `@hsafa/node` SDK. Airflow is a **service** that triggers the agent via API — not an entity, not a space member.

---

## Client Tools + Space Tools Interaction

**Direct cross-space UI** — an agent can route a client tool to another space using `targetSpaceId`. No agent-to-agent delegation needed:
```
Agent in Space A calls showApprovalForm({ targetSpaceId: spaceB, amount: 50000 })
→ UI renders in Space B, Space B's client handles interaction
```

**Agent-to-agent** — an agent in Space A can call `sendSpaceMessage(spaceB, ..., mention: agentB, wait: { for: [{ type: "agent" }] })` which triggers an agent in Space B. That Space B agent might call a client tool (renders in Space B). The client tool flow works independently per space — Space B's subscribers handle Space B's client tools. Agent A just sees the final reply text when `wait` resolves.

Use `targetSpaceId` for just showing UI. Use `mention` + `wait` when you need another agent to **reason** about something.
