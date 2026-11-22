// Uthana's API (https://uthana.com/docs/api, read 2026-11-22): GraphQL at https://uthana.com/graphql, HTTP
// Basic with the key as the user and no password, uploads as GraphQL multipart (operations, map, a file part
// named 0), files from /motion/file/motion_viewer/<character>/<motion>/glb/. Node 18 or later (fetch).

const Base = "https://uthana.com";

/** Uthana's text-to-motion models, with their price per second and allowed lengths (Uthana's docs, 2026-11-22). */
export const Models = {
  "text-to-motion-3.0": { perSecond: 0.1, min: 4, max: 10 },
  "text-to-motion-3.0-lite": { perSecond: 0.1, min: 5, max: 10 },
  "text-to-motion-3.0-mini": { perSecond: 0.075, min: 5, max: 10 },
} as const;
export type Model = keyof typeof Models;

/** What a text-to-motion job costs, in US dollars: Uthana charges only a finished job. */
export function cost(model: Model, seconds: number): number {
  return Math.round(Models[model].perSecond * seconds * 100) / 100;
}

export interface UthanaJob {
  id: string;
  status: "RESERVED" | "READY" | "FINISHED" | "FAILED" | string;
  result?: unknown;
}

export interface DownloadOptions {
  fps?: 24 | 30 | 60;
  inPlace?: boolean;
  /** Uthana's torso_only: the lower body held still, for arm and upper body motions. */
  torsoOnly?: boolean;
}

export interface Uthana {
  check(): Promise<void>;
  /** An already rigged character, as is: no auto-rig, so its bones and names are the file's. Uthana answers the same id for the same file. */
  createCharacter(name: string, fileName: string, bytes: Buffer): Promise<{ id: string; name: string }>;
  textToMotion(prompt: string, options: { model?: Model; length?: number; characterId?: string; rewritePrompt?: boolean }): Promise<UthanaJob>;
  job(id: string): Promise<UthanaJob>;
  /** Polls a job until it is FINISHED or FAILED. */
  wait(id: string, options?: { every?: number; timeout?: number; onStatus?: (status: string) => void; signal?: AbortSignal }): Promise<UthanaJob>;
  /** A motion as GLB, retargeted onto the character, skeleton and keys only. */
  download(characterId: string, motionId: string, options?: DownloadOptions): Promise<Buffer>;
}

export function uthana(key: string, fetchImpl: typeof fetch = fetch): Uthana {
  if (!key) throw new Error("No Uthana key");
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  const answer = async (r: Response) => {
    const text = await r.text();
    let body: { data?: Record<string, any>; errors?: { message: string }[] };
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Uthana answered ${r.status}: ${text.slice(0, 300)}`);
    }
    if (body.errors?.length) throw new Error(`Uthana: ${body.errors.map((e) => e.message).join("; ")}`);
    if (!r.ok || !body.data) throw new Error(`Uthana answered ${r.status}: ${text.slice(0, 300)}`);
    return body.data;
  };
  const gql = async (query: string, variables?: Record<string, unknown>) =>
    answer(await fetchImpl(`${Base}/graphql`, { method: "POST", headers: { Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) }));

  const client: Uthana = {
    async check() {
      await gql("{ __typename }");
    },

    async createCharacter(name, fileName, bytes) {
      const form = new FormData();
      const query = "mutation ($file: Upload!, $name: String!, $auto_rig: Boolean) { create_character(file: $file, name: $name, auto_rig: $auto_rig) { character { id name } auto_rig_confidence } }";
      form.append("operations", JSON.stringify({ query, variables: { name, auto_rig: false, file: null } }));
      form.append("map", JSON.stringify({ 0: ["variables.file"] }));
      form.append("0", new Blob([new Uint8Array(bytes)]), fileName);
      const d = await answer(await fetchImpl(`${Base}/graphql`, { method: "POST", headers: { Authorization: auth }, body: form }));
      return d.create_character.character;
    },

    async textToMotion(prompt, { model = "text-to-motion-3.0", length = 5, characterId, rewritePrompt } = {}) {
      const m = Models[model];
      if (!m) throw new Error(`No Uthana model ${model}`);
      if (!(length >= m.min && length <= m.max)) throw new Error(`${model} makes ${m.min} to ${m.max} seconds, not ${length}`);
      const args = [`prompt: ${JSON.stringify(prompt)}`, `model: ${JSON.stringify(model)}`, `length: ${Number(length)}`];
      if (characterId) args.push(`character_id: ${JSON.stringify(characterId)}`);
      if (rewritePrompt === false) args.push("rewrite_prompt: false");
      const d = await gql(`mutation { create_text_to_motion_job(${args.join(", ")}) { job { id status } } }`);
      return d.create_text_to_motion_job.job;
    },

    async job(id) {
      return (await gql(`query { job(job_id: ${JSON.stringify(id)}) { id status result } }`)).job;
    },

    async wait(id, { every = 5000, timeout = 15 * 60000, onStatus, signal } = {}) {
      const until = Date.now() + timeout;
      let last = "";
      for (;;) {
        if (signal?.aborted) throw new Error("Stopped");
        const j = await client.job(id);
        if (j.status !== last) onStatus?.((last = j.status));
        if (j.status === "FINISHED" || j.status === "FAILED") return j;
        if (Date.now() > until) throw new Error(`Uthana's job ${id} is still ${j.status} after ${timeout / 60000} minutes`);
        await new Promise((r) => setTimeout(r, every));
      }
    },

    async download(characterId, motionId, { fps = 30, inPlace = true, torsoOnly = false } = {}) {
      const qs = new URLSearchParams({ fps: String(fps), no_mesh: "true", ...(inPlace ? { in_place: "true" } : {}), ...(torsoOnly ? { torso_only: "true" } : {}) });
      let url = `${Base}/motion/file/motion_viewer/${encodeURIComponent(characterId)}/${encodeURIComponent(motionId)}/glb/motion.glb?${qs}`;
      let r = await fetchImpl(url, { headers: { Authorization: auth }, redirect: "manual" });
      // A redirect is followed with the key only when it stays on Uthana's own host.
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        url = new URL(r.headers.get("location")!, url).toString();
        r = await fetchImpl(url, new URL(url).origin === Base ? { headers: { Authorization: auth } } : {});
      }
      if (!r.ok) throw new Error(`Uthana's download answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
  return client;
}

/** The motion id in a finished job's result (result.result.id in Uthana's docs). */
export function motionIdOf(job: UthanaJob): string | undefined {
  let r: any = job?.result;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return undefined;
    }
  }
  return r?.result?.id ?? r?.id ?? r?.motion?.id ?? r?.result?.motion?.id;
}
