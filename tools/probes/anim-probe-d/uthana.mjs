// A small Uthana API client for Probe D (docs/research/animation-authoring.md, section 8), from Uthana's docs
// (https://uthana.com/docs/api, read 2026-11-22): GraphQL at https://uthana.com/graphql, HTTP Basic with the key
// as the user and no password, uploads as GraphQL multipart, files from /motion/file/motion_viewer/.
const Base = "https://uthana.com";

export function uthana(key) {
  const auth = `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

  async function gql(query, variables) {
    const r = await fetch(`${Base}/graphql`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Uthana answered ${r.status}: ${text.slice(0, 300)}`);
    }
    if (body.errors?.length) throw new Error(`Uthana: ${body.errors.map((e) => e.message).join("; ")}`);
    if (!r.ok) throw new Error(`Uthana answered ${r.status}: ${text.slice(0, 300)}`);
    return body.data;
  }

  /** A GraphQL multipart upload (the spec's operations, map and one file part named 0). */
  async function upload(query, variables, fileName, bytes) {
    const form = new FormData();
    form.append("operations", JSON.stringify({ query, variables: { ...variables, file: null } }));
    form.append("map", JSON.stringify({ 0: ["variables.file"] }));
    form.append("0", new Blob([bytes]), fileName);
    const r = await fetch(`${Base}/graphql`, { method: "POST", headers: { Authorization: auth }, body: form });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Uthana answered ${r.status}: ${text.slice(0, 300)}`);
    }
    if (body.errors?.length) throw new Error(`Uthana: ${body.errors.map((e) => e.message).join("; ")}`);
    return body.data;
  }

  return {
    check: () => gql("{ __typename }"),

    /** An already rigged character, as is: no auto-rig, so its bones and names are the file's. */
    createCharacter: (name, fileName, bytes) =>
      upload(
        "mutation ($file: Upload!, $name: String!, $auto_rig: Boolean) { create_character(file: $file, name: $name, auto_rig: $auto_rig) { character { id name } auto_rig_confidence } }",
        { name, auto_rig: false },
        fileName,
        bytes,
      ).then((d) => d.create_character),

    /** Text to motion 3.0, an async job, retargeted onto character_id. */
    textToMotion: (prompt, { model = "text-to-motion-3.0", length = 5, characterId } = {}) =>
      gql(
        `mutation { create_text_to_motion_job(prompt: ${JSON.stringify(prompt)}, model: ${JSON.stringify(model)}, length: ${Number(length)}${characterId ? `, character_id: ${JSON.stringify(characterId)}` : ""}) { job { id status } } }`,
      ).then((d) => d.create_text_to_motion_job.job),

    job: (id) => gql(`query { job(job_id: ${JSON.stringify(id)}) { id status result } }`).then((d) => d.job),

    /** Polls a job until FINISHED or FAILED; answers the job. */
    async wait(id, { every = 5000, timeout = 15 * 60000, log = () => {} } = {}) {
      const until = Date.now() + timeout;
      for (;;) {
        const j = await this.job(id);
        log(j.status);
        if (j.status === "FINISHED" || j.status === "FAILED") return j;
        if (Date.now() > until) throw new Error(`Uthana job ${id} still ${j.status} after ${timeout / 60000} min`);
        await new Promise((r) => setTimeout(r, every));
      }
    },

    /**
     * A motion as GLB on a character. query: fps (24, 30 or 60), no_mesh, in_place and the rest of the docs'
     * parameters. A redirect is followed without the key, which goes to Uthana only.
     */
    async download(characterId, motionId, query = {}) {
      const qs = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString();
      let url = `${Base}/motion/file/motion_viewer/${encodeURIComponent(characterId)}/${encodeURIComponent(motionId)}/glb/motion.glb${qs ? `?${qs}` : ""}`;
      let r = await fetch(url, { headers: { Authorization: auth }, redirect: "manual" });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        url = new URL(r.headers.get("location"), url).toString();
        r = await fetch(url, new URL(url).origin === Base ? { headers: { Authorization: auth } } : {});
      }
      if (!r.ok) throw new Error(`Uthana download answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}

/** The motion id in a finished job's result (result.result.id in the docs), or a search of the result for one. */
export function motionIdOf(job) {
  let r = job?.result;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return undefined;
    }
  }
  return r?.result?.id ?? r?.id ?? r?.motion?.id ?? r?.result?.motion?.id;
}
