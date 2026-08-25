// src/cloud/db.ts
import { neon, neonConfig } from "@neondatabase/serverless";

// src/cloud/protocol.ts
var lockTtlMs = 20 * 60 * 1e3;

// src/cloud/db.ts
var localHosts = ["localhost", "127.0.0.1"];
var localProxyPort = 4444;
neonConfig.fetchEndpoint = (host, port) => localHosts.includes(host) ? `http://${host}:${localProxyPort}/sql` : `https://${host}:${port}/sql`;
var CloudError = class extends Error {
  constructor(name, message, detail) {
    super(message);
    this.name = name;
    this.detail = detail;
  }
};
function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  return neon(url);
}
function toVersion(row) {
  return {
    // bigserial arrives as a string, since it can exceed a JS number
    id: Number(row.id),
    savedAt: row.saved_at.toISOString(),
    author: row.author,
    note: row.note
  };
}
async function getVersions(sql, slug) {
  const rows = await sql`
        select v.id, v.saved_at, v.author, v.note
        from project p
        left join project_version v on v.project_id = p.id
        where p.slug = ${slug}
        order by v.saved_at desc, v.id desc
    `;
  if (rows.length === 0) {
    throw new CloudError("NotFound", `no project '${slug}'`);
  }
  return rows.filter((r) => r.id !== null).map(toVersion);
}
async function getVersion(sql, slug, id) {
  const rows = await sql`
        select v.id, v.saved_at, v.author, v.note, v.files
        from project_version v
        join project p on p.id = v.project_id
        where p.slug = ${slug} and v.id = ${id}
    `;
  if (rows.length === 0) {
    throw new CloudError("NotFound", `no version ${id} in '${slug}'`);
  }
  return { ...toVersion(rows[0]), files: rows[0].files };
}

// src/cloud/routes/_lib.ts
var statusByError = {
  NotFound: 404,
  Locked: 409,
  Invalid: 400
};
var jsonHeaders = { "content-type": "application/json" };
function json(body2, status = 200) {
  return new Response(JSON.stringify(body2), { status, headers: jsonHeaders });
}
async function handle(handler) {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof CloudError) {
      return json(
        { error: err.name, message: err.message, detail: err.detail },
        statusByError[err.name] ?? 400
      );
    }
    console.error(err);
    return json({ error: "Internal", message: "something went wrong" }, 500);
  }
}
function segments(request, after) {
  const { pathname } = new URL(request.url);
  return pathname.slice(pathname.indexOf(after) + after.length).split("/").filter((s) => s !== "");
}

// src/cloud/routes/projects/[slug]/versions/_handlers.ts
function target(request) {
  const parts = segments(request, "/api/projects/");
  const slug = parts[0] ?? "";
  const raw = parts[2];
  return { slug, id: raw === void 0 ? void 0 : Number(raw) };
}
function GET(request) {
  return handle(async () => {
    const { slug, id } = target(request);
    const sql = connect();
    if (id !== void 0) {
      return json(await getVersion(sql, slug, id));
    }
    return json(await getVersions(sql, slug));
  });
}
export {
  GET
};
