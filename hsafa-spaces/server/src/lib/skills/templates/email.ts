// =============================================================================
// Email Skill Template
//
// General-purpose email skill — ONE instance attaches to any number of
// haseefs, and per-haseef credentials live on each haseef's profileJson:
//
//   haseef.profileJson.email = {
//     address:    "user@example.com",   // required
//     password:   "app-password",       // required
//     fromName?:  "Display Name",
//     smtpHost?:  "smtp.gmail.com",     // auto-defaulted from the domain
//     smtpPort?:  587,
//     smtpSecure?: false,
//     imapHost?:  "imap.gmail.com",     // auto-defaulted from the domain
//     imapPort?:  993,
//   }
//
// The instance config only controls POLICY (require-confirmation, enable
// IDLE, fetch limits). Domain presets are provided for Gmail, Outlook/
// Office365, Yahoo, iCloud; a generic `smtp.<domain>` / `imap.<domain>`
// fallback covers most other providers.
//
// Deps: nodemailer (SMTP), imapflow (IMAP + IDLE), mailparser (MIME).
// =============================================================================

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { ImapFlow } from "imapflow";
import type { ImapFlowOptions, ListResponse } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { randomUUID, createHash } from "node:crypto";
import type {
  SkillTemplateDefinition,
  SkillHandler,
  ToolCallContext,
  SenseLoopContext,
} from "../types.js";

// =============================================================================
// Template Definition
// =============================================================================

export const emailTemplate: SkillTemplateDefinition = {
  name: "email",
  displayName: "Email",
  description:
    "Read, send, search, and organize email over SMTP+IMAP. The instance holds the provider's server details (SMTP/IMAP host + port). Each haseef supplies only its own email address + password via profileJson.email — one instance serves many haseefs. Real-time inbox via IMAP IDLE; user-defined filters fire targeted alerts.",
  category: "communication",
  configSchema: {
    type: "object",
    description:
      "Instance-level SERVER config + policy. Per-haseef identity (address + password) is read from haseef.profileJson.email. If you leave SMTP/IMAP fields blank, the handler auto-detects them from each haseef's address domain (Gmail, Outlook/Office365, Yahoo, iCloud supported; generic providers try smtp.<domain> / imap.<domain>).",
    properties: {
      // ── Server connection (leave blank for domain-based auto-detect) ────────
      smtpHost: {
        type: "string",
        description: "SMTP server hostname (e.g. smtp.gmail.com). Leave blank to auto-detect from each haseef's address domain.",
      },
      smtpPort: {
        type: "number",
        description: "SMTP port (default: 587 for STARTTLS, 465 for implicit TLS).",
        default: 587,
      },
      smtpSecure: {
        type: "boolean",
        description: "Use implicit TLS (true for port 465, false for STARTTLS on 587).",
        default: false,
      },
      imapHost: {
        type: "string",
        description: "IMAP server hostname (e.g. imap.gmail.com). Leave blank to auto-detect from each haseef's address domain.",
      },
      imapPort: {
        type: "number",
        description: "IMAP port (default: 993).",
        default: 993,
      },
      // ── Policy ──────────────────────────────────────────────────────────────
      requireConfirmation: {
        type: "boolean",
        description: "Require draft → confirm before sending (default: true).",
        default: true,
      },
      enableIdleSense: {
        type: "boolean",
        description: "Enable IMAP IDLE listener for real-time email.received / email.filter_matched events (default: true).",
        default: true,
      },
      maxFetchCount: {
        type: "number",
        description: "Max messages returned per list/search (default: 20).",
        default: 20,
      },
      reconcileIntervalMs: {
        type: "number",
        description: "How often the sense loop re-reads each attached haseef's profile to add/remove/refresh IDLE connections (default: 300000 = 5 min).",
        default: 300000,
      },
    },
  },
  tools: [
    // ── Diagnostics ───────────────────────────────────────────────────────────
    {
      name: "check_email_config",
      description:
        "Verify this haseef has valid email credentials on their profile. Returns the resolved configuration (with password redacted) OR a list of missing / invalid fields the user must add to profile.email.",
      inputSchema: { type: "object", properties: {} },
      mode: "sync",
    },
    // ── Sending ───────────────────────────────────────────────────────────────
    {
      name: "draft_email",
      description:
        "Compose an email draft. NOT sent — call confirm_send with the returned draftId after user approval.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" }, description: "Recipient addresses." },
          subject: { type: "string" },
          body: { type: "string", description: "Plain-text body." },
          html: { type: "string", description: "Optional HTML body." },
          cc: { type: "array", items: { type: "string" } },
          bcc: { type: "array", items: { type: "string" } },
          replyToMessageId: {
            type: "string",
            description: "Message-ID of the message being replied to (sets In-Reply-To/References).",
          },
        },
        required: ["to", "subject", "body"],
      },
      mode: "sync",
    },
    {
      name: "confirm_send",
      description:
        "Send a draft after the user has approved it. Call ONLY after explicit approval.",
      inputSchema: {
        type: "object",
        properties: { draftId: { type: "string" } },
        required: ["draftId"],
      },
      mode: "sync",
    },
    {
      name: "send_email",
      description:
        "Draft and send in one step. Only available when requireConfirmation=false on the instance.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" } },
          subject: { type: "string" },
          body: { type: "string" },
          html: { type: "string" },
          cc: { type: "array", items: { type: "string" } },
          bcc: { type: "array", items: { type: "string" } },
        },
        required: ["to", "subject", "body"],
      },
      mode: "sync",
    },
    // ── Reading ───────────────────────────────────────────────────────────────
    {
      name: "list_emails",
      description:
        "List recent email threads from a folder (INBOX by default). Threads group messages by subject. Returns a compact preview — use read_email for full content.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "Folder (default: INBOX)." },
          limit: { type: "number" },
          unreadOnly: { type: "boolean" },
          since: { type: "string", description: "ISO-8601 date." },
        },
      },
      mode: "sync",
    },
    {
      name: "read_email",
      description:
        "Read one message (by messageUid) or a whole thread (by threadKey returned from list_emails).",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string" },
          messageUid: { type: "number" },
          threadKey: { type: "string" },
        },
      },
      mode: "sync",
    },
    {
      name: "search_emails",
      description: "Search messages by sender / subject / body / date range / attachments.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string" },
          from: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          since: { type: "string" },
          before: { type: "string" },
          hasAttachment: { type: "boolean" },
          limit: { type: "number" },
        },
      },
      mode: "sync",
    },
    {
      name: "list_folders",
      description: "List all mailbox folders available on the IMAP server.",
      inputSchema: { type: "object", properties: {} },
      mode: "sync",
    },
    {
      name: "mark_email",
      description: "Mark a message as read / unread / flagged / unflagged.",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string" },
          messageUid: { type: "number" },
          action: { type: "string", enum: ["read", "unread", "flag", "unflag"] },
        },
        required: ["messageUid", "action"],
      },
      mode: "sync",
    },
    {
      name: "move_email",
      description: "Move a message to another folder (archive/file).",
      inputSchema: {
        type: "object",
        properties: {
          sourceFolder: { type: "string" },
          destinationFolder: { type: "string" },
          messageUid: { type: "number" },
        },
        required: ["destinationFolder", "messageUid"],
      },
      mode: "sync",
    },
    // ── Filters (watches) ────────────────────────────────────────────────────
    {
      name: "create_email_filter",
      description:
        "Create a filter that raises an email.filter_matched sense event whenever an incoming email matches ALL provided criteria. At least one criterion required.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "e.g. 'Emails from my boss'." },
          from: { type: "string", description: "Substring match on sender." },
          subject: { type: "string", description: "Substring match on subject." },
          keywords: { type: "array", items: { type: "string" }, description: "Body must contain at least one." },
          hasAttachment: { type: "boolean" },
          priority: { type: "string", enum: ["high", "normal"] },
        },
        required: ["description"],
      },
      mode: "sync",
    },
    {
      name: "list_email_filters",
      description: "List this haseef's filters on this skill instance.",
      inputSchema: { type: "object", properties: {} },
      mode: "sync",
    },
    {
      name: "delete_email_filter",
      description: "Delete a filter by id.",
      inputSchema: {
        type: "object",
        properties: { filterId: { type: "string" } },
        required: ["filterId"],
      },
      mode: "sync",
    },
  ],
  instructions: `You have full email access AND real-time inbox awareness.

HOW CREDENTIALS WORK (important):
  Configuration is split into two layers:
    1. INSTANCE (set once by the admin): SMTP + IMAP server details
       (smtpHost, smtpPort, smtpSecure, imapHost, imapPort) plus policy
       (requireConfirmation, enableIdleSense, ...). The server details may
       be left blank — in that case they auto-default from each haseef's
       address domain (Gmail, Outlook/Office365, Yahoo, iCloud have presets;
       generic providers try smtp.<domain> / imap.<domain>).
    2. HASEEF PROFILE (set per user): profile.email = {
         address,       // required
         password,      // required (app password for providers with 2FA)
         fromName?      // optional display name used on outgoing mail
       }

  If a tool returns { error: "Email not configured ..." } you MUST stop and
  ask the user to add their email to their profile. Example message:
    "I need your email details. Please add them to your profile:
     address: <you@…>, password: <app password>. For Gmail with 2FA,
     generate an App Password at https://myaccount.google.com/apppasswords."
  Run check_email_config any time to verify the setup — it also reveals
  which server details came from the instance vs the domain preset.

SENDING (draft → confirm is the default):
  1. draft_email to compose — the mail is NOT sent.
  2. Show the full draft to the user and ask for approval.
  3. Call confirm_send with the draftId only AFTER approval.
  4. Never skip confirmation unless requireConfirmation=false on the instance.

READING:
  - list_emails groups messages into threads.
  - read_email with threadKey to see the whole conversation.
  - search_emails for specific lookups.

ORGANIZING:
  - mark_email (read/unread/flag/unflag), move_email, list_folders.

SENSES — Real-time inbox:
  - email.received: fired for every new mail when enableIdleSense is on.
    Summarize (from, subject, gist) and flag urgency.
  - email.filter_matched: fires when an incoming email matches a user filter.
    Lead with the filter description so the user remembers why they are being
    alerted, then summarize and suggest follow-up (reply, flag, archive).

FILTERS — Turning senses into actions:
  User: "Tell me whenever my boss emails me."
    → create_email_filter { description: "Emails from my boss",
                            from: "boss@company.com", priority: "high" }
  User: "Ping me when invoices with attachments arrive."
    → create_email_filter { description: "Invoice emails",
                            keywords: ["invoice","payment"], hasAttachment: true }

SAFETY:
  - Never send without explicit user approval when requireConfirmation=true.
  - Warn about obvious phishing / suspicious senders.
  - Never disclose email contents to third parties.`,

  createHandler: (config: Record<string, unknown>): SkillHandler => createEmailHandler(config),
};

// =============================================================================
// Instance config — server details + policy
// =============================================================================

interface InstanceConfig {
  // Server hints — any that are set override the per-haseef domain defaults.
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number;
  // Policy
  requireConfirmation: boolean;
  enableIdleSense: boolean;
  maxFetchCount: number;
  reconcileIntervalMs: number;
}

function parseInstanceConfig(raw: Record<string, unknown>): InstanceConfig {
  return {
    smtpHost: typeof raw.smtpHost === "string" && raw.smtpHost.trim() ? raw.smtpHost.trim() : undefined,
    smtpPort: Number.isFinite(Number(raw.smtpPort)) ? Number(raw.smtpPort) : undefined,
    smtpSecure: typeof raw.smtpSecure === "boolean" ? raw.smtpSecure : undefined,
    imapHost: typeof raw.imapHost === "string" && raw.imapHost.trim() ? raw.imapHost.trim() : undefined,
    imapPort: Number.isFinite(Number(raw.imapPort)) ? Number(raw.imapPort) : undefined,
    requireConfirmation: raw.requireConfirmation !== false,
    enableIdleSense: raw.enableIdleSense !== false,
    maxFetchCount: Number(raw.maxFetchCount ?? 20),
    reconcileIntervalMs: Math.max(60_000, Number(raw.reconcileIntervalMs ?? 300_000)),
  };
}

// =============================================================================
// Per-haseef credentials (resolved from profile.email)
// =============================================================================

interface EmailCreds {
  address: string;
  password: string;
  fromName?: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  /** Stable hash over (address + password + hosts/ports) — used to detect changes. */
  fingerprint: string;
}

interface MissingConfig {
  missing: string[];
  invalid: string[];
}

/**
 * Resolve per-haseef credentials.
 *   - Identity (address, password, fromName) comes from profile.email.
 *   - Server details (smtp/imap host + port + secure) come from:
 *       1. Instance config if set
 *       2. Otherwise, domain-based preset derived from the address
 *       3. Otherwise, generic smtp.<domain> / imap.<domain> fallback
 */
function resolveCreds(
  instance: InstanceConfig,
  profile: Record<string, unknown>,
): EmailCreds | MissingConfig {
  const emailRaw = profile.email;

  // Accept either a nested object OR a JSON-encoded string (the spaces UI
  // currently only stores string fields — users can paste the JSON directly).
  let email: Record<string, unknown> | null = null;
  if (emailRaw && typeof emailRaw === "object") {
    email = emailRaw as Record<string, unknown>;
  } else if (typeof emailRaw === "string" && emailRaw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(emailRaw);
      if (parsed && typeof parsed === "object") email = parsed as Record<string, unknown>;
    } catch {
      /* fall through → missing */
    }
  }
  if (!email) {
    return { missing: ["profile.email", "profile.email.address", "profile.email.password"], invalid: [] };
  }

  const missing: string[] = [];
  const invalid: string[] = [];

  const address = typeof email.address === "string" ? email.address.trim() : "";
  const password = typeof email.password === "string" ? email.password : "";
  if (!address) missing.push("profile.email.address");
  if (!password) missing.push("profile.email.password");
  if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) invalid.push("profile.email.address (not an email)");

  if (missing.length > 0 || invalid.length > 0) return { missing, invalid };

  // Resolve server details: instance config first, then domain preset.
  const presets = defaultsForDomain(address);
  const smtpHost = instance.smtpHost ?? presets.smtpHost;
  const smtpPort = instance.smtpPort ?? presets.smtpPort;
  const smtpSecure = instance.smtpSecure ?? false;
  const imapHost = instance.imapHost ?? presets.imapHost;
  const imapPort = instance.imapPort ?? presets.imapPort;
  const fromName = typeof email.fromName === "string" && email.fromName ? email.fromName : undefined;

  const fingerprint = createHash("sha1")
    .update(`${address}|${password}|${smtpHost}:${smtpPort}:${smtpSecure ? 1 : 0}|${imapHost}:${imapPort}`)
    .digest("hex");

  return { address, password, fromName, smtpHost, smtpPort, smtpSecure, imapHost, imapPort, fingerprint };
}

function isCreds(v: EmailCreds | MissingConfig): v is EmailCreds {
  return (v as EmailCreds).address !== undefined && (v as EmailCreds).password !== undefined;
}

// Domain presets — stops users needing to remember host/port combos.
interface Preset {
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}
function defaultsForDomain(address: string): Preset {
  const domain = (address.split("@")[1] ?? "").toLowerCase();
  const presets: Record<string, Preset> = {
    "gmail.com":     { smtpHost: "smtp.gmail.com",         smtpPort: 587, imapHost: "imap.gmail.com",         imapPort: 993 },
    "googlemail.com":{ smtpHost: "smtp.gmail.com",         smtpPort: 587, imapHost: "imap.gmail.com",         imapPort: 993 },
    "outlook.com":   { smtpHost: "smtp-mail.outlook.com",  smtpPort: 587, imapHost: "outlook.office365.com",  imapPort: 993 },
    "hotmail.com":   { smtpHost: "smtp-mail.outlook.com",  smtpPort: 587, imapHost: "outlook.office365.com",  imapPort: 993 },
    "live.com":      { smtpHost: "smtp-mail.outlook.com",  smtpPort: 587, imapHost: "outlook.office365.com",  imapPort: 993 },
    "msn.com":       { smtpHost: "smtp-mail.outlook.com",  smtpPort: 587, imapHost: "outlook.office365.com",  imapPort: 993 },
    "yahoo.com":     { smtpHost: "smtp.mail.yahoo.com",    smtpPort: 587, imapHost: "imap.mail.yahoo.com",    imapPort: 993 },
    "yahoo.co.uk":   { smtpHost: "smtp.mail.yahoo.com",    smtpPort: 587, imapHost: "imap.mail.yahoo.com",    imapPort: 993 },
    "ymail.com":     { smtpHost: "smtp.mail.yahoo.com",    smtpPort: 587, imapHost: "imap.mail.yahoo.com",    imapPort: 993 },
    "icloud.com":    { smtpHost: "smtp.mail.me.com",       smtpPort: 587, imapHost: "imap.mail.me.com",       imapPort: 993 },
    "me.com":        { smtpHost: "smtp.mail.me.com",       smtpPort: 587, imapHost: "imap.mail.me.com",       imapPort: 993 },
    "mac.com":       { smtpHost: "smtp.mail.me.com",       smtpPort: 587, imapHost: "imap.mail.me.com",       imapPort: 993 },
  };
  if (presets[domain]) return presets[domain];
  // Generic fallback — works for many custom domains behind e.g. Fastmail,
  // Zoho, Mailgun, self-hosted. Users can override via profile.
  return {
    smtpHost: `smtp.${domain || "example.com"}`,
    smtpPort: 587,
    imapHost: `imap.${domain || "example.com"}`,
    imapPort: 993,
  };
}

// =============================================================================
// Handler state + creation
// =============================================================================

interface Draft {
  to: string[];
  subject: string;
  body: string;
  html?: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
  createdBy: string;
  createdAt: Date;
}

interface EmailFilter {
  id: string;
  haseefId: string;
  description: string;
  from?: string;
  subject?: string;
  keywords?: string[];
  hasAttachment?: boolean;
  priority: "high" | "normal";
  createdAt: Date;
}

interface IdleEntry {
  haseefId: string;
  fingerprint: string;
  client: ImapFlow | null;
  stopRequested: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  lastKnownUid: number;
}

function createEmailHandler(rawConfig: Record<string, unknown>): SkillHandler {
  const instance = parseInstanceConfig(rawConfig);

  const drafts = new Map<string, Draft>();
  const filters = new Map<string, EmailFilter>();
  // Cache SMTP transporters per-haseef (keyed by fingerprint too so we
  // rebuild when credentials change).
  const transporters = new Map<string, { transporter: Transporter; fingerprint: string }>();
  const idle = new Map<string, IdleEntry>();
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;
  let senseCtx: SenseLoopContext | null = null;

  // ── SMTP transporter cache ─────────────────────────────────────────────────
  function getTransporter(creds: EmailCreds): Transporter {
    const cached = transporters.get(creds.address);
    if (cached && cached.fingerprint === creds.fingerprint) return cached.transporter;
    if (cached) {
      try {
        cached.transporter.close();
      } catch {
        /* best effort */
      }
    }
    const transporter = nodemailer.createTransport({
      host: creds.smtpHost,
      port: creds.smtpPort,
      secure: creds.smtpSecure,
      auth: { user: creds.address, pass: creds.password },
    });
    transporters.set(creds.address, { transporter, fingerprint: creds.fingerprint });
    return transporter;
  }

  // ── Per-call IMAP client ──────────────────────────────────────────────────
  async function withImap<T>(creds: EmailCreds, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
    const client = buildImapClient(creds);
    await client.connect();
    try {
      return await fn(client);
    } finally {
      try {
        await client.logout();
      } catch {
        /* best effort */
      }
    }
  }

  // ── IDLE reconciliation (add / refresh / remove per haseef) ────────────────
  async function reconcileIdle(): Promise<void> {
    if (!senseCtx || !instance.enableIdleSense) return;
    const attached = new Set(await senseCtx.getAttachedHaseefs());

    // 1. Stop IDLE for haseefs no longer attached.
    for (const [haseefId, entry] of idle.entries()) {
      if (!attached.has(haseefId)) {
        stopIdleEntry(entry);
        idle.delete(haseefId);
      }
    }

    // 2. Start / refresh IDLE for attached haseefs.
    for (const haseefId of attached) {
      const profile = await senseCtx.getHaseefProfile(haseefId);
      const resolved = resolveCreds(instance, profile);
      if (!isCreds(resolved)) {
        // Missing creds — ensure any stale IDLE is stopped.
        const existing = idle.get(haseefId);
        if (existing) {
          stopIdleEntry(existing);
          idle.delete(haseefId);
        }
        continue;
      }

      const existing = idle.get(haseefId);
      if (existing && existing.fingerprint === resolved.fingerprint && existing.client) {
        continue; // already running with current creds
      }
      if (existing) {
        stopIdleEntry(existing);
        idle.delete(haseefId);
      }

      const entry: IdleEntry = {
        haseefId,
        fingerprint: resolved.fingerprint,
        client: null,
        stopRequested: false,
        reconnectTimer: null,
        lastKnownUid: 0,
      };
      idle.set(haseefId, entry);
      void runIdleFor(entry, resolved);
    }
  }

  // ── IDLE loop for ONE haseef ───────────────────────────────────────────────
  async function runIdleFor(entry: IdleEntry, creds: EmailCreds): Promise<void> {
    if (entry.stopRequested || !senseCtx) return;
    try {
      const client = buildImapClient(creds);
      entry.client = client;
      client.on("error", (err) => {
        console.warn(`[skill:email][${creds.address}] IDLE client error: ${err instanceof Error ? err.message : err}`);
      });
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      try {
        const status = await client.status("INBOX", { uidNext: true });
        if (typeof status.uidNext === "number") entry.lastKnownUid = status.uidNext - 1;

        client.on("exists", async () => {
          try {
            await drainNewMessages(entry, creds);
          } catch (err) {
            console.warn(`[skill:email][${creds.address}] drain error:`, err);
          }
        });

        while (!entry.stopRequested && entry.client === client) {
          try {
            await client.idle();
          } catch (err) {
            console.warn(`[skill:email][${creds.address}] IDLE loop broke:`, err);
            break;
          }
        }
      } finally {
        lock.release();
      }
      try {
        await client.logout();
      } catch {
        /* best effort */
      }
    } catch (err) {
      console.warn(`[skill:email][${creds.address}] IDLE connect failed:`, err instanceof Error ? err.message : err);
    }

    entry.client = null;
    if (!entry.stopRequested) {
      entry.reconnectTimer = setTimeout(() => runIdleFor(entry, creds).catch(() => undefined), 10_000);
    }
  }

  async function drainNewMessages(entry: IdleEntry, creds: EmailCreds): Promise<void> {
    const client = entry.client;
    if (!client || !senseCtx) return;
    const nextUid = entry.lastKnownUid + 1;

    const fetched = client.fetch(
      `${nextUid}:*`,
      { envelope: true, flags: true, uid: true, bodyStructure: true, source: true },
      { uid: true },
    );

    for await (const msg of fetched) {
      if (typeof msg.uid !== "number") continue;
      if (msg.uid > entry.lastKnownUid) entry.lastKnownUid = msg.uid;

      const parsed = msg.source ? await safeParse(msg.source as Buffer) : null;
      const env = msg.envelope;
      const from = env?.from?.[0]?.address ?? parsed?.from?.value?.[0]?.address ?? "unknown";
      const fromName = env?.from?.[0]?.name ?? parsed?.from?.value?.[0]?.name ?? "";
      const to = (env?.to ?? []).map((a) => a.address ?? "").filter(Boolean);
      const subject = env?.subject ?? parsed?.subject ?? "(no subject)";
      const date = (env?.date ? new Date(env.date) : parsed?.date ?? new Date()).toISOString();
      const snippet = makeSnippet(parsed?.text ?? "");
      const hasAttachments = (parsed?.attachments?.length ?? 0) > 0;

      const eventData = {
        messageUid: msg.uid,
        messageId: env?.messageId ?? parsed?.messageId ?? null,
        from,
        fromName,
        to,
        subject,
        snippet,
        date,
        hasAttachments,
        folder: "INBOX",
        mailbox: creds.address,
      };

      // 1) email.received → this haseef only (the mailbox owner).
      await senseCtx.pushEvent(entry.haseefId, { type: "email.received", data: eventData });

      // 2) email.filter_matched → for each of this haseef's matching filters.
      for (const filter of filters.values()) {
        if (filter.haseefId !== entry.haseefId) continue;
        const m = matchFilter(filter, { from, subject, body: parsed?.text ?? "", hasAttachments });
        if (!m.matched) continue;
        await senseCtx.pushEvent(entry.haseefId, {
          type: "email.filter_matched",
          data: {
            filterId: filter.id,
            filterDescription: filter.description,
            matchedOn: m.matchedOn,
            priority: filter.priority,
            email: eventData,
          },
        });
      }
    }
  }

  function stopIdleEntry(entry: IdleEntry): void {
    entry.stopRequested = true;
    if (entry.reconnectTimer) {
      clearTimeout(entry.reconnectTimer);
      entry.reconnectTimer = null;
    }
    if (entry.client) {
      try {
        entry.client.close();
      } catch {
        /* best effort */
      }
      entry.client = null;
    }
  }

  // ── Tool dispatch ──────────────────────────────────────────────────────────
  return {
    async execute(toolName: string, args: Record<string, unknown>, ctx: ToolCallContext): Promise<unknown> {
      if (toolName === "check_email_config") return handleCheckConfig(instance, ctx);

      // Every other tool needs creds.
      const resolved = resolveCreds(instance, ctx.haseefProfile);
      if (!isCreds(resolved)) {
        return {
          error:
            "Email not configured for this haseef. Ask the user to set these fields on their profile.email:",
          missing: resolved.missing,
          invalid: resolved.invalid,
          example: {
            "profile.email": {
              address: "user@example.com",
              password: "app-password (for Gmail with 2FA, use an App Password)",
              fromName: "Optional display name",
            },
          },
        };
      }

      switch (toolName) {
        case "draft_email":
          return handleDraft(args, ctx, drafts);
        case "confirm_send":
          return handleConfirmSend(args, drafts, resolved, instance, getTransporter);
        case "send_email":
          return handleSendNow(args, resolved, instance, getTransporter);
        case "list_emails":
          return handleListEmails(args, instance, resolved, withImap);
        case "read_email":
          return handleReadEmail(args, resolved, withImap);
        case "search_emails":
          return handleSearchEmails(args, instance, resolved, withImap);
        case "list_folders":
          return handleListFolders(resolved, withImap);
        case "mark_email":
          return handleMarkEmail(args, resolved, withImap);
        case "move_email":
          return handleMoveEmail(args, resolved, withImap);
        case "create_email_filter":
          return handleCreateFilter(args, ctx, filters);
        case "list_email_filters":
          return handleListFilters(ctx, filters);
        case "delete_email_filter":
          return handleDeleteFilter(args, ctx, filters);
        default:
          return { error: `Unknown tool: ${toolName}` };
      }
    },

    async startSenseLoop(ctxIn: SenseLoopContext) {
      senseCtx = ctxIn;
      if (!instance.enableIdleSense) return;

      // Kick off immediately, then reconcile on an interval so profile edits
      // / new haseefs / removed haseefs are picked up without a restart.
      await reconcileIdle().catch((err) => console.warn("[skill:email] reconcile error:", err));
      reconcileTimer = setInterval(() => {
        reconcileIdle().catch((err) => console.warn("[skill:email] reconcile error:", err));
      }, instance.reconcileIntervalMs);
    },

    async stopSenseLoop() {
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
      for (const entry of idle.values()) {
        stopIdleEntry(entry);
      }
      idle.clear();
    },

    async destroy() {
      drafts.clear();
      filters.clear();
      for (const { transporter } of transporters.values()) {
        try {
          transporter.close();
        } catch {
          /* best effort */
        }
      }
      transporters.clear();
    },
  };
}

// =============================================================================
// IMAP client factory
// =============================================================================

function buildImapClient(creds: EmailCreds): ImapFlow {
  const opts: ImapFlowOptions = {
    host: creds.imapHost,
    port: creds.imapPort,
    secure: true,
    auth: { user: creds.address, pass: creds.password },
    logger: false,
    emitLogs: false,
  };
  return new ImapFlow(opts);
}

// =============================================================================
// Tool handlers
// =============================================================================

function handleCheckConfig(instance: InstanceConfig, ctx: ToolCallContext): unknown {
  const resolved = resolveCreds(instance, ctx.haseefProfile);
  if (!isCreds(resolved)) {
    return {
      configured: false,
      missing: resolved.missing,
      invalid: resolved.invalid,
      help: "Add the email configuration to this haseef's profile. Minimal shape: profile.email = { address, password }. For Gmail with 2FA, generate an App Password at https://myaccount.google.com/apppasswords.",
    };
  }
  return {
    configured: true,
    address: resolved.address,
    fromName: resolved.fromName ?? null,
    smtpHost: resolved.smtpHost,
    smtpPort: resolved.smtpPort,
    smtpSecure: resolved.smtpSecure,
    imapHost: resolved.imapHost,
    imapPort: resolved.imapPort,
    serverSource: {
      smtpHost: instance.smtpHost ? "instance" : "domain-preset",
      imapHost: instance.imapHost ? "instance" : "domain-preset",
    },
    note: "Password redacted. Identity (address, password, fromName) comes from profile.email; server details come from the instance config, falling back to the address-domain preset where blank.",
  };
}

async function handleDraft(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  drafts: Map<string, Draft>,
): Promise<unknown> {
  const to = toStringArray(args.to);
  const subject = String(args.subject ?? "");
  const body = String(args.body ?? "");
  if (to.length === 0) return { error: "to is required (non-empty array)" };
  if (!subject) return { error: "subject is required" };
  if (!body) return { error: "body is required" };

  const draft: Draft = {
    to,
    subject,
    body,
    html: args.html ? String(args.html) : undefined,
    cc: args.cc ? toStringArray(args.cc) : undefined,
    bcc: args.bcc ? toStringArray(args.bcc) : undefined,
    replyToMessageId: args.replyToMessageId ? String(args.replyToMessageId) : undefined,
    createdBy: ctx.haseefId,
    createdAt: new Date(),
  };
  const draftId = randomUUID();
  drafts.set(draftId, draft);

  return {
    draftId,
    to: draft.to,
    subject: draft.subject,
    bodyPreview: body.slice(0, 400),
    note: "Draft created — show this to the user and call confirm_send after approval.",
  };
}

async function handleConfirmSend(
  args: Record<string, unknown>,
  drafts: Map<string, Draft>,
  creds: EmailCreds,
  _policy: InstanceConfig,
  getTransporter: (c: EmailCreds) => Transporter,
): Promise<unknown> {
  const draftId = String(args.draftId ?? "");
  if (!draftId) return { error: "draftId is required" };
  const draft = drafts.get(draftId);
  if (!draft) return { error: `Draft not found: ${draftId}` };

  try {
    const info = await getTransporter(creds).sendMail({
      from: creds.fromName ? `"${creds.fromName}" <${creds.address}>` : creds.address,
      to: draft.to.join(", "),
      subject: draft.subject,
      text: draft.body,
      html: draft.html,
      cc: draft.cc?.join(", "),
      bcc: draft.bcc?.join(", "),
      inReplyTo: draft.replyToMessageId,
      references: draft.replyToMessageId,
    });
    drafts.delete(draftId);
    return { success: true, messageId: info.messageId, to: draft.to, subject: draft.subject };
  } catch (err: any) {
    return { error: `send failed: ${err?.message ?? String(err)}` };
  }
}

async function handleSendNow(
  args: Record<string, unknown>,
  creds: EmailCreds,
  policy: InstanceConfig,
  getTransporter: (c: EmailCreds) => Transporter,
): Promise<unknown> {
  if (policy.requireConfirmation) {
    return { error: "This instance requires draft → confirm. Use draft_email then confirm_send after approval." };
  }
  const to = toStringArray(args.to);
  if (to.length === 0) return { error: "to is required" };
  try {
    const info = await getTransporter(creds).sendMail({
      from: creds.fromName ? `"${creds.fromName}" <${creds.address}>` : creds.address,
      to: to.join(", "),
      subject: String(args.subject ?? ""),
      text: String(args.body ?? ""),
      html: args.html ? String(args.html) : undefined,
      cc: args.cc ? toStringArray(args.cc).join(", ") : undefined,
      bcc: args.bcc ? toStringArray(args.bcc).join(", ") : undefined,
    });
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    return { error: `send failed: ${err?.message ?? String(err)}` };
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

interface ThreadPreview {
  threadKey: string;
  subject: string;
  participants: string[];
  lastDate: string;
  messageCount: number;
  snippet: string;
  isRead: boolean;
  hasAttachments: boolean;
  uids: number[];
}

async function handleListEmails(
  args: Record<string, unknown>,
  policy: InstanceConfig,
  creds: EmailCreds,
  withImap: <T>(c: EmailCreds, fn: (client: ImapFlow) => Promise<T>) => Promise<T>,
): Promise<unknown> {
  const folder = String(args.folder ?? "INBOX");
  const limit = clampInt(args.limit, 1, 200, policy.maxFetchCount);
  const unreadOnly = args.unreadOnly === true;
  const since = args.since ? new Date(String(args.since)) : undefined;

  try {
    const preview = await withImap(creds, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const search: Record<string, unknown> = {};
        if (unreadOnly) search.seen = false;
        if (since && !isNaN(since.getTime())) search.since = since;

        const searchResult = await client.search(search, { uid: true });
        const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
        const recent = uids.slice(-limit * 3);
        if (recent.length === 0) return [];

        const list: Array<{
          uid: number;
          subject: string;
          from: string;
          to: string[];
          date: Date;
          seen: boolean;
          snippet: string;
          hasAttachments: boolean;
          threadKey: string;
        }> = [];

        for await (const msg of client.fetch(
          recent,
          { envelope: true, flags: true, uid: true, bodyStructure: true, source: true },
          { uid: true },
        )) {
          if (typeof msg.uid !== "number") continue;
          const parsed = msg.source ? await safeParse(msg.source as Buffer) : null;
          const env = msg.envelope;
          const subject = env?.subject ?? parsed?.subject ?? "(no subject)";
          const fromAddr = env?.from?.[0]?.address ?? "unknown";
          const toAddrs = (env?.to ?? []).map((a) => a.address ?? "").filter(Boolean);
          const date = env?.date ? new Date(env.date) : parsed?.date ?? new Date();
          const flags = msg.flags instanceof Set ? msg.flags : new Set<string>();
          const seen = flags.has("\\Seen");
          const snippet = makeSnippet(parsed?.text ?? "");
          const hasAttachments = (parsed?.attachments?.length ?? 0) > 0;
          list.push({
            uid: msg.uid,
            subject,
            from: fromAddr,
            to: toAddrs,
            date,
            seen,
            snippet,
            hasAttachments,
            threadKey: threadKeyFor(subject),
          });
        }

        const byKey = new Map<string, ThreadPreview>();
        for (const m of list) {
          const existing = byKey.get(m.threadKey);
          if (!existing) {
            byKey.set(m.threadKey, {
              threadKey: m.threadKey,
              subject: m.subject,
              participants: Array.from(new Set([m.from, ...m.to])),
              lastDate: m.date.toISOString(),
              messageCount: 1,
              snippet: m.snippet,
              isRead: m.seen,
              hasAttachments: m.hasAttachments,
              uids: [m.uid],
            });
          } else {
            existing.messageCount += 1;
            existing.participants = Array.from(new Set([...existing.participants, m.from, ...m.to]));
            if (m.date.getTime() > new Date(existing.lastDate).getTime()) {
              existing.lastDate = m.date.toISOString();
              existing.snippet = m.snippet;
              existing.subject = m.subject;
              existing.isRead = m.seen;
              existing.hasAttachments = m.hasAttachments || existing.hasAttachments;
            }
            existing.uids.push(m.uid);
          }
        }

        return Array.from(byKey.values())
          .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime())
          .slice(0, limit);
      } finally {
        lock.release();
      }
    });

    return { folder, threads: preview, count: preview.length };
  } catch (err: any) {
    return { error: `list failed: ${err?.message ?? String(err)}` };
  }
}

async function handleReadEmail(
  args: Record<string, unknown>,
  creds: EmailCreds,
  withImap: <T>(c: EmailCreds, fn: (client: ImapFlow) => Promise<T>) => Promise<T>,
): Promise<unknown> {
  const folder = String(args.folder ?? "INBOX");
  const messageUid = args.messageUid != null ? Number(args.messageUid) : undefined;
  const threadKey = args.threadKey ? String(args.threadKey) : undefined;
  if (!messageUid && !threadKey) return { error: "Provide messageUid or threadKey." };

  try {
    return await withImap(creds, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        let uids: number[] = [];
        if (messageUid) {
          uids = [messageUid];
        } else if (threadKey) {
          const searchResult = await client.search({}, { uid: true });
          const searchUids: number[] = Array.isArray(searchResult) ? searchResult : [];
          const tail = searchUids.slice(-200);
          for await (const m of client.fetch(tail, { envelope: true, uid: true }, { uid: true })) {
            if (typeof m.uid === "number") {
              const subj = m.envelope?.subject ?? "";
              if (threadKeyFor(subj) === threadKey) uids.push(m.uid);
            }
          }
        }

        if (uids.length === 0) return { error: "No messages found." };

        const out: Array<ReturnType<typeof serializeParsed>> = [];
        for await (const msg of client.fetch(
          uids,
          { source: true, envelope: true, uid: true, flags: true },
          { uid: true },
        )) {
          if (!msg.source) continue;
          const parsed = await safeParse(msg.source as Buffer);
          if (parsed) out.push(serializeParsed(msg.uid!, parsed));
        }
        return { folder, messages: out, count: out.length };
      } finally {
        lock.release();
      }
    });
  } catch (err: any) {
    return { error: `read failed: ${err?.message ?? String(err)}` };
  }
}

async function handleSearchEmails(
  args: Record<string, unknown>,
  policy: InstanceConfig,
  creds: EmailCreds,
  withImap: <T>(c: EmailCreds, fn: (client: ImapFlow) => Promise<T>) => Promise<T>,
): Promise<unknown> {
  const folder = String(args.folder ?? "INBOX");
  const limit = clampInt(args.limit, 1, 200, policy.maxFetchCount);
  const from = args.from ? String(args.from) : undefined;
  const subject = args.subject ? String(args.subject) : undefined;
  const body = args.body ? String(args.body) : undefined;
  const since = args.since ? new Date(String(args.since)) : undefined;
  const before = args.before ? new Date(String(args.before)) : undefined;
  const hasAttachment = args.hasAttachment === true;

  try {
    const hits = await withImap(creds, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        const search: Record<string, unknown> = {};
        if (from) search.from = from;
        if (subject) search.subject = subject;
        if (body) search.body = body;
        if (since && !isNaN(since.getTime())) search.since = since;
        if (before && !isNaN(before.getTime())) search.before = before;

        const searchResult = await client.search(search, { uid: true });
        const uids: number[] = Array.isArray(searchResult) ? searchResult : [];
        const recent = uids.slice(-limit);
        const out: Array<{
          uid: number;
          from: string;
          subject: string;
          date: string;
          snippet: string;
          hasAttachments: boolean;
        }> = [];

        for await (const msg of client.fetch(
          recent,
          { envelope: true, uid: true, source: true, bodyStructure: true },
          { uid: true },
        )) {
          if (typeof msg.uid !== "number") continue;
          const parsed = msg.source ? await safeParse(msg.source as Buffer) : null;
          const env = msg.envelope;
          const attach = (parsed?.attachments?.length ?? 0) > 0;
          if (hasAttachment && !attach) continue;
          out.push({
            uid: msg.uid,
            from: env?.from?.[0]?.address ?? "unknown",
            subject: env?.subject ?? parsed?.subject ?? "(no subject)",
            date: (env?.date ? new Date(env.date) : parsed?.date ?? new Date()).toISOString(),
            snippet: makeSnippet(parsed?.text ?? ""),
            hasAttachments: attach,
          });
        }
        return out;
      } finally {
        lock.release();
      }
    });
    return { folder, messages: hits, count: hits.length };
  } catch (err: any) {
    return { error: `search failed: ${err?.message ?? String(err)}` };
  }
}

async function handleListFolders(
  creds: EmailCreds,
  withImap: <T>(c: EmailCreds, fn: (client: ImapFlow) => Promise<T>) => Promise<T>,
): Promise<unknown> {
  try {
    const folders = await withImap(creds, async (client) => {
      const list = (await client.list()) as ListResponse[];
      return list.map((m) => ({
        name: m.name,
        path: m.path,
        flags: Array.from(m.flags ?? []),
        specialUse: m.specialUse ?? null,
      }));
    });
    return { folders, count: folders.length };
  } catch (err: any) {
    return { error: `list folders failed: ${err?.message ?? String(err)}` };
  }
}

async function handleMarkEmail(
  args: Record<string, unknown>,
  creds: EmailCreds,
  withImap: <T>(c: EmailCreds, fn: (client: ImapFlow) => Promise<T>) => Promise<T>,
): Promise<unknown> {
  const folder = String(args.folder ?? "INBOX");
  const messageUid = Number(args.messageUid);
  const action = String(args.action ?? "");
  if (!messageUid) return { error: "messageUid is required" };
  const mapping: Record<string, { flag: string; set: boolean }> = {
    read: { flag: "\\Seen", set: true },
    unread: { flag: "\\Seen", set: false },
    flag: { flag: "\\Flagged", set: true },
    unflag: { flag: "\\Flagged", set: false },
  };
  const op = mapping[action];
  if (!op) return { error: `Unknown action: ${action}` };

  try {
    await withImap(creds, async (client) => {
      const lock = await client.getMailboxLock(folder);
      try {
        if (op.set) {
          await client.messageFlagsAdd(messageUid, [op.flag], { uid: true });
        } else {
          await client.messageFlagsRemove(messageUid, [op.flag], { uid: true });
        }
      } finally {
        lock.release();
      }
    });
    return { success: true, folder, messageUid, action };
  } catch (err: any) {
    return { error: `mark failed: ${err?.message ?? String(err)}` };
  }
}

async function handleMoveEmail(
  args: Record<string, unknown>,
  creds: EmailCreds,
  withImap: <T>(c: EmailCreds, fn: (client: ImapFlow) => Promise<T>) => Promise<T>,
): Promise<unknown> {
  const sourceFolder = String(args.sourceFolder ?? "INBOX");
  const destinationFolder = String(args.destinationFolder ?? "");
  const messageUid = Number(args.messageUid);
  if (!destinationFolder) return { error: "destinationFolder is required" };
  if (!messageUid) return { error: "messageUid is required" };

  try {
    await withImap(creds, async (client) => {
      const lock = await client.getMailboxLock(sourceFolder);
      try {
        await client.messageMove(messageUid, destinationFolder, { uid: true });
      } finally {
        lock.release();
      }
    });
    return { success: true, from: sourceFolder, to: destinationFolder, messageUid };
  } catch (err: any) {
    return { error: `move failed: ${err?.message ?? String(err)}` };
  }
}

// ── Filters ─────────────────────────────────────────────────────────────────

function handleCreateFilter(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  filters: Map<string, EmailFilter>,
): unknown {
  const description = String(args.description ?? "");
  if (!description) return { error: "description is required" };

  const from = args.from ? String(args.from) : undefined;
  const subject = args.subject ? String(args.subject) : undefined;
  const keywords = args.keywords ? toStringArray(args.keywords) : undefined;
  const hasAttachment = args.hasAttachment === true ? true : undefined;
  const priority = (args.priority === "high" ? "high" : "normal") as "high" | "normal";

  if (!from && !subject && !(keywords && keywords.length > 0) && !hasAttachment) {
    return { error: "At least one criterion (from, subject, keywords, hasAttachment) is required." };
  }

  const id = randomUUID();
  const filter: EmailFilter = {
    id,
    haseefId: ctx.haseefId,
    description,
    from,
    subject,
    keywords,
    hasAttachment,
    priority,
    createdAt: new Date(),
  };
  filters.set(id, filter);

  return {
    success: true,
    filter: serializeFilter(filter),
    note: "You'll receive email.filter_matched sense events when an incoming email matches this filter.",
  };
}

function handleListFilters(ctx: ToolCallContext, filters: Map<string, EmailFilter>): unknown {
  const mine = Array.from(filters.values())
    .filter((f) => f.haseefId === ctx.haseefId)
    .map(serializeFilter);
  return { filters: mine, count: mine.length };
}

function handleDeleteFilter(
  args: Record<string, unknown>,
  ctx: ToolCallContext,
  filters: Map<string, EmailFilter>,
): unknown {
  const filterId = String(args.filterId ?? "");
  if (!filterId) return { error: "filterId is required" };
  const existing = filters.get(filterId);
  if (!existing) return { error: "Filter not found" };
  if (existing.haseefId !== ctx.haseefId) return { error: "Filter does not belong to this haseef" };
  filters.delete(filterId);
  return { success: true, deletedId: filterId };
}

function serializeFilter(f: EmailFilter) {
  return {
    id: f.id,
    description: f.description,
    from: f.from ?? null,
    subject: f.subject ?? null,
    keywords: f.keywords ?? null,
    hasAttachment: f.hasAttachment ?? null,
    priority: f.priority,
    createdAt: f.createdAt.toISOString(),
  };
}

function matchFilter(
  filter: EmailFilter,
  msg: { from: string; subject: string; body: string; hasAttachments: boolean },
): { matched: boolean; matchedOn: string[] } {
  const matchedOn: string[] = [];
  if (filter.from) {
    if (!msg.from.toLowerCase().includes(filter.from.toLowerCase())) return { matched: false, matchedOn };
    matchedOn.push("from");
  }
  if (filter.subject) {
    if (!msg.subject.toLowerCase().includes(filter.subject.toLowerCase())) return { matched: false, matchedOn };
    matchedOn.push("subject");
  }
  if (filter.keywords && filter.keywords.length > 0) {
    const body = msg.body.toLowerCase();
    const anyHit = filter.keywords.some((k) => body.includes(k.toLowerCase()));
    if (!anyHit) return { matched: false, matchedOn };
    matchedOn.push("keywords");
  }
  if (filter.hasAttachment) {
    if (!msg.hasAttachments) return { matched: false, matchedOn };
    matchedOn.push("hasAttachment");
  }
  return { matched: true, matchedOn };
}

// =============================================================================
// Helpers
// =============================================================================

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === "string" && value.length > 0) return [value];
  return [];
}

function makeSnippet(text: string, max = 240): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? compact.slice(0, max) + "…" : compact;
}

function threadKeyFor(subject: string): string {
  return subject
    .replace(/^(?:re|fw|fwd|aw)\s*:\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function safeParse(source: Buffer): Promise<ParsedMail | null> {
  try {
    return await simpleParser(source);
  } catch {
    return null;
  }
}

function serializeParsed(uid: number, p: ParsedMail) {
  const addresses = (arr: ParsedMail["from"] | ParsedMail["to"] | undefined) => {
    if (!arr) return [];
    const value = Array.isArray(arr) ? arr : [arr];
    const out: Array<{ address: string; name?: string }> = [];
    for (const entry of value) {
      for (const v of entry.value ?? []) {
        if (v.address) out.push({ address: v.address, name: v.name });
      }
    }
    return out;
  };

  return {
    uid,
    messageId: p.messageId ?? null,
    from: addresses(p.from),
    to: addresses(p.to),
    cc: addresses(p.cc),
    subject: p.subject ?? "(no subject)",
    date: (p.date ?? new Date()).toISOString(),
    text: p.text ?? "",
    html: p.html || null,
    attachments: (p.attachments ?? []).map((a) => ({
      filename: a.filename ?? null,
      contentType: a.contentType,
      size: a.size,
    })),
  };
}

export default emailTemplate;
