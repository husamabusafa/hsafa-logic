// =============================================================================
// Scope Docker — Container lifecycle management for scope instances
//
// Manages Docker containers for platform + custom scope instances.
// External and built-in scopes are not managed here.
//
// Uses dockerode to talk to the Docker daemon via /var/run/docker.sock.
// =============================================================================

import Docker from "dockerode";
import { EventEmitter } from "events";
import { prisma } from "./db.js";
import { decrypt } from "./encryption.js";

// =============================================================================
// Deployment log streaming — allows SSE endpoints to subscribe to live logs
// =============================================================================

export const deploymentEvents = new EventEmitter();
deploymentEvents.setMaxListeners(50);

function emitDeployLog(deploymentId: string, line: string) {
  deploymentEvents.emit(`log:${deploymentId}`, line);
}

function emitDeployDone(deploymentId: string, status: "success" | "failed") {
  deploymentEvents.emit(`done:${deploymentId}`, status);
}

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

// Network name for scope containers (same network as Core + Spaces)
const DOCKER_NETWORK = process.env.SCOPE_DOCKER_NETWORK || "hsafa-network";

// Resource limits
const DEFAULT_MEMORY = 256 * 1024 * 1024; // 256MB
const DEFAULT_CPU = 500_000_000;           // 0.5 CPU (in NanoCpus)

// =============================================================================
// Types
// =============================================================================

export type ContainerStatus = "stopped" | "starting" | "running" | "error" | "building" | "removing";

export interface DeployResult {
  containerId: string;
  containerStatus: ContainerStatus;
  statusMessage?: string;
  deploymentId: string;
}

// =============================================================================
// Deploy — pull image + create + start container
// =============================================================================

/**
 * Deploy (or re-deploy) a scope instance as a Docker container.
 *
 * 1. Pull the Docker image (if not cached)
 * 2. Remove old container (if exists)
 * 3. Build env vars from ScopeInstanceConfig rows
 * 4. Create + start container on the hsafa network
 * 5. Update DB with containerId + status
 */
export async function deployInstance(instanceId: string, triggeredBy?: string): Promise<DeployResult> {
  const instance = await prisma.scopeInstance.findUnique({
    where: { id: instanceId },
    include: { configs: true, template: { select: { imageUrl: true } } },
  });

  if (!instance) throw new Error(`Instance ${instanceId} not found`);

  const imageUrl = instance.imageUrl || instance.template.imageUrl;
  if (!imageUrl) throw new Error(`No Docker image URL for instance ${instanceId}`);

  // Create deployment record
  const deployment = await prisma.scopeDeployment.create({
    data: {
      instanceId,
      status: "running",
      triggeredBy: triggeredBy ?? null,
      imageUrl,
      logs: "",
    },
  });
  const deploymentId = deployment.id;

  // Helper to append a log line to the deployment record + emit for SSE
  async function appendLog(line: string) {
    const ts = new Date().toISOString();
    const entry = `[${ts}] ${line}`;
    emitDeployLog(deploymentId, entry);
    await prisma.scopeDeployment.update({
      where: { id: deploymentId },
      data: { logs: { set: undefined } },
    }).catch(() => {});
    // Use raw SQL for efficient append
    await prisma.$executeRawUnsafe(
      `UPDATE scope_deployments SET logs = logs || $1 WHERE id = $2::uuid`,
      entry + "\n",
      deploymentId,
    ).catch(() => {});
  }

  // Mark instance as starting
  await prisma.scopeInstance.update({
    where: { id: instanceId },
    data: { containerStatus: "starting", statusMessage: "Pulling image..." },
  });

  await appendLog(`Deployment started for "${instance.scopeName}"`);
  await appendLog(`Image: ${imageUrl}`);

  try {
    // 1. Pull image
    await appendLog("Pulling Docker image...");
    await pullImage(imageUrl);
    await appendLog("Image pulled successfully.");

    // 2. Remove old container if exists
    if (instance.containerId) {
      await appendLog("Removing old container...");
      await removeContainerSafe(instance.containerId);
      await appendLog("Old container removed.");
    }

    // 3. Build env vars
    await appendLog("Building environment variables...");
    const envVars = await buildEnvVars(instance.id, instance.scopeName, instance.configs);
    await appendLog(`Environment ready (${envVars.length} vars).`);

    // 4. Ensure network exists
    await appendLog("Ensuring Docker network...");
    await ensureNetwork();

    // 5. Create container
    const containerName = `scope-${instance.scopeName}`;
    await removeContainerByNameSafe(containerName);
    await appendLog("Creating container...");

    const container = await docker.createContainer({
      Image: imageUrl,
      name: containerName,
      Env: envVars,
      HostConfig: {
        NetworkMode: DOCKER_NETWORK,
        RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
        Memory: DEFAULT_MEMORY,
        NanoCpus: DEFAULT_CPU,
      },
      Labels: {
        "hsafa.scope": "true",
        "hsafa.scope.name": instance.scopeName,
        "hsafa.scope.instance": instance.id,
      },
    });
    await appendLog(`Container created: ${container.id.slice(0, 12)}`);

    // 6. Start container
    await appendLog("Starting container...");
    await container.start();

    const containerId = container.id;

    // 7. Update DB
    await prisma.scopeInstance.update({
      where: { id: instanceId },
      data: {
        containerId,
        containerStatus: "running",
        statusMessage: null,
        imageUrl: imageUrl,
      },
    });

    await appendLog(`Container started successfully.`);
    await appendLog(`Deployment complete.`);

    // Mark deployment as success
    await prisma.scopeDeployment.update({
      where: { id: deploymentId },
      data: { status: "success", containerId, finishedAt: new Date() },
    });
    emitDeployDone(deploymentId, "success");

    console.log(`[scope-docker] Deployed "${instance.scopeName}" → container ${containerId.slice(0, 12)}`);
    return { containerId, containerStatus: "running", deploymentId };
  } catch (err: any) {
    const msg = err.message || String(err);
    await prisma.scopeInstance.update({
      where: { id: instanceId },
      data: { containerStatus: "error", statusMessage: msg },
    });

    await appendLog(`ERROR: ${msg}`);

    // Mark deployment as failed
    await prisma.scopeDeployment.update({
      where: { id: deploymentId },
      data: { status: "failed", errorMessage: msg, finishedAt: new Date() },
    });
    emitDeployDone(deploymentId, "failed");

    console.error(`[scope-docker] Deploy failed for "${instance.scopeName}":`, msg);
    return { containerId: "", containerStatus: "error", statusMessage: msg, deploymentId };
  }
}

// =============================================================================
// Start / Stop / Restart
// =============================================================================

export async function startInstance(instanceId: string): Promise<void> {
  const instance = await prisma.scopeInstance.findUnique({ where: { id: instanceId } });
  if (!instance?.containerId) throw new Error("No container to start");

  const container = docker.getContainer(instance.containerId);
  await container.start();

  await prisma.scopeInstance.update({
    where: { id: instanceId },
    data: { containerStatus: "running", statusMessage: null },
  });
  console.log(`[scope-docker] Started "${instance.scopeName}"`);
}

export async function stopInstance(instanceId: string): Promise<void> {
  const instance = await prisma.scopeInstance.findUnique({ where: { id: instanceId } });
  if (!instance?.containerId) throw new Error("No container to stop");

  const container = docker.getContainer(instance.containerId);
  await container.stop({ t: 10 });

  await prisma.scopeInstance.update({
    where: { id: instanceId },
    data: { containerStatus: "stopped", statusMessage: null },
  });
  console.log(`[scope-docker] Stopped "${instance.scopeName}"`);
}

export async function restartInstance(instanceId: string): Promise<void> {
  const instance = await prisma.scopeInstance.findUnique({ where: { id: instanceId } });
  if (!instance?.containerId) throw new Error("No container to restart");

  const container = docker.getContainer(instance.containerId);
  await container.restart({ t: 10 });

  await prisma.scopeInstance.update({
    where: { id: instanceId },
    data: { containerStatus: "running", statusMessage: null },
  });
  console.log(`[scope-docker] Restarted "${instance.scopeName}"`);
}

// =============================================================================
// Remove — stop + delete container + clear DB fields
// =============================================================================

export async function removeInstance(instanceId: string): Promise<void> {
  const instance = await prisma.scopeInstance.findUnique({ where: { id: instanceId } });
  if (!instance) return;

  if (instance.containerId) {
    await removeContainerSafe(instance.containerId);
  }

  await prisma.scopeInstance.update({
    where: { id: instanceId },
    data: { containerId: null, containerStatus: "stopped", statusMessage: null },
  });
  console.log(`[scope-docker] Removed container for "${instance.scopeName}"`);
}

// =============================================================================
// Logs — stream or tail container logs
// =============================================================================

export async function getInstanceLogs(
  instanceId: string,
  opts: { tail?: number; since?: number } = {},
): Promise<string> {
  const instance = await prisma.scopeInstance.findUnique({ where: { id: instanceId } });
  if (!instance?.containerId) return "";

  const container = docker.getContainer(instance.containerId);
  const logStream = await container.logs({
    stdout: true,
    stderr: true,
    tail: opts.tail ?? 200,
    since: opts.since ?? 0,
    timestamps: true,
  });

  // dockerode returns a Buffer; demux the multiplexed stream
  if (Buffer.isBuffer(logStream)) {
    return demuxDockerLogs(logStream);
  }
  return String(logStream);
}

// =============================================================================
// Status — check container health
// =============================================================================

export async function getContainerStatus(instanceId: string): Promise<{
  containerStatus: ContainerStatus;
  statusMessage?: string;
}> {
  const instance = await prisma.scopeInstance.findUnique({ where: { id: instanceId } });
  if (!instance?.containerId) {
    return { containerStatus: instance?.containerStatus as ContainerStatus ?? "stopped" };
  }

  try {
    const container = docker.getContainer(instance.containerId);
    const info = await container.inspect();
    const state = info.State;

    if (state.Running) return { containerStatus: "running" };
    if (state.Restarting) return { containerStatus: "starting" };
    if (state.ExitCode !== 0) return { containerStatus: "error", statusMessage: `Exited with code ${state.ExitCode}` };
    return { containerStatus: "stopped" };
  } catch (err: any) {
    if (err.statusCode === 404) {
      return { containerStatus: "stopped", statusMessage: "Container not found" };
    }
    return { containerStatus: "error", statusMessage: err.message };
  }
}

// =============================================================================
// Health Check — periodic status sync for all managed instances
// =============================================================================

export async function syncAllContainerStatuses(): Promise<void> {
  const instances = await prisma.scopeInstance.findMany({
    where: {
      deploymentType: { in: ["platform", "custom"] },
      containerId: { not: null },
    },
    select: { id: true, scopeName: true, containerId: true, containerStatus: true },
  });

  for (const inst of instances) {
    try {
      const { containerStatus, statusMessage } = await getContainerStatus(inst.id);
      if (containerStatus !== inst.containerStatus) {
        await prisma.scopeInstance.update({
          where: { id: inst.id },
          data: {
            containerStatus,
            statusMessage: statusMessage ?? null,
            ...(containerStatus === "running" ? { lastHealthAt: new Date() } : {}),
          },
        });
        console.log(`[scope-docker] Status sync: "${inst.scopeName}" → ${containerStatus}`);
      } else if (containerStatus === "running") {
        await prisma.scopeInstance.update({
          where: { id: inst.id },
          data: { lastHealthAt: new Date() },
        });
      }
    } catch {
      // skip individual failures
    }
  }
}

// =============================================================================
// Helpers
// =============================================================================

async function pullImage(imageUrl: string): Promise<void> {
  // Check if image exists locally first
  try {
    const image = docker.getImage(imageUrl);
    await image.inspect();
    console.log(`[scope-docker] Image "${imageUrl}" found locally — skipping pull`);
    return;
  } catch {
    // Image not found locally — pull from registry
  }

  console.log(`[scope-docker] Pulling image "${imageUrl}"...`);
  return new Promise<void>((resolve, reject) => {
    docker.pull(imageUrl, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      // Follow the pull progress to completion
      docker.modem.followProgress(stream, (err2: Error | null) => {
        if (err2) return reject(err2);
        resolve();
      });
    });
  });
}

async function ensureNetwork(): Promise<void> {
  try {
    const network = docker.getNetwork(DOCKER_NETWORK);
    await network.inspect();
  } catch {
    // Network doesn't exist — create it
    await docker.createNetwork({ Name: DOCKER_NETWORK, Driver: "bridge" });
    console.log(`[scope-docker] Created network "${DOCKER_NETWORK}"`);
  }
}

async function removeContainerSafe(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    try { await container.stop({ t: 5 }); } catch { /* might already be stopped */ }
    await container.remove({ force: true });
  } catch {
    // Container might not exist — that's fine
  }
}

async function removeContainerByNameSafe(name: string): Promise<void> {
  try {
    const containers = await docker.listContainers({ all: true, filters: { name: [name] } });
    for (const c of containers) {
      // Docker name matching is prefix-based, verify exact match
      if (c.Names.some((n) => n === `/${name}`)) {
        await removeContainerSafe(c.Id);
      }
    }
  } catch {
    // ignore
  }
}

async function buildEnvVars(
  instanceId: string,
  scopeName: string,
  configs: Array<{ key: string; value: string; isSecret: boolean }>,
): Promise<string[]> {
  // Host-facing URL — used by Spaces server to provision scope keys
  const hostCoreUrl = process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
  // Docker-internal URL — used by containers to reach Core on the Docker network
  const containerCoreUrl = process.env.SCOPE_CORE_URL || "http://hsafa-core:3001";
  const serviceKey = process.env.CORE_SERVICE_KEY || "";

  // Provision a scope key (from host → Core)
  const scopeKey = await provisionScopeKey(hostCoreUrl, serviceKey, scopeName);

  const env: string[] = [
    `SCOPE_NAME=${scopeName}`,
    `CORE_URL=${containerCoreUrl}`,
    `SCOPE_KEY=${scopeKey}`,
  ];

  // Add user config (decrypt secrets)
  for (const cfg of configs) {
    const value = cfg.isSecret ? decrypt(cfg.value) : cfg.value;
    // Convert config key to env var format: connectionString → CONNECTION_STRING
    const envKey = cfg.key.replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, "");
    env.push(`${envKey}=${value}`);
  }

  return env;
}

/**
 * Provision a scope key from Core for a container instance.
 * Stores the key in ScopeInstanceConfig so it can be re-used on restart.
 */
async function provisionScopeKey(coreUrl: string, serviceKey: string, scopeName: string): Promise<string> {
  const headers = { "Content-Type": "application/json", "x-api-key": serviceKey };

  // Check if we already have a scope key stored
  // (We don't store it yet — this will be provisioned fresh each deploy)

  // Revoke existing scope keys for this scope
  try {
    const listRes = await fetch(`${coreUrl}/api/keys?type=scope&resourceId=${encodeURIComponent(scopeName)}`, { headers });
    if (listRes.ok) {
      const { keys } = await listRes.json();
      for (const k of keys ?? []) {
        await fetch(`${coreUrl}/api/keys/${k.id}/revoke`, { method: "POST", headers });
      }
    }
  } catch { /* best-effort cleanup */ }

  // Create fresh scope key
  const res = await fetch(`${coreUrl}/api/keys`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "scope",
      resourceId: scopeName,
      description: `Scope key for "${scopeName}" (container instance)`,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to create scope key (${res.status}): ${text}`);
  }

  const { key } = await res.json();
  return key;
}

/**
 * Demux Docker multiplexed log stream.
 * Docker prepends an 8-byte header to each frame:
 *   [stream_type(1), 0, 0, 0, size(4 big-endian)]
 */
function demuxDockerLogs(buffer: Buffer): string {
  const lines: string[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) break;

    const size = buffer.readUInt32BE(offset + 4);
    offset += 8;

    if (offset + size > buffer.length) break;

    const line = buffer.subarray(offset, offset + size).toString("utf8");
    lines.push(line);
    offset += size;
  }

  // If demux failed (no valid headers), return raw string
  if (lines.length === 0 && buffer.length > 0) {
    return buffer.toString("utf8");
  }

  return lines.join("");
}

// =============================================================================
// Docker availability check
// =============================================================================

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}
