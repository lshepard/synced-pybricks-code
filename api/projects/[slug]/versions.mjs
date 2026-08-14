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
async function addVersion(sql, slug, save) {
  const files = validFiles(save.files);
  const author = (save.author ?? "").trim();
  const note = (save.note ?? "").trim();
  const rows = await sql`
        insert into project_version (project_id, author, note, files)
        select p.id, ${author}, ${note}, ${JSON.stringify(files)}::jsonb
        from project p
        where p.slug = ${slug}
          and not exists (
              select 1 from project_edit_lock l
              where l.project_id = p.id
                and l.session_id <> ${save.sessionId}
                and l.since > now() - make_interval(secs => ${lockTtlMs / 1e3})
          )
        returning id, saved_at, author, note
    `;
  if (rows.length === 0) {
    throw await describeWriteFailure(sql, slug);
  }
  await sql`
        update project set updated_at = now()
        where slug = ${slug}
    `;
  return toVersion(rows[0]);
}
async function describeWriteFailure(sql, slug) {
  const lock = await getLock(sql, slug);
  if (lock) {
    return new CloudError("Locked", `'${slug}' is being edited by ${lock.holder}`, {
      holder: lock.holder,
      since: lock.since
    });
  }
  return new CloudError("NotFound", `no project '${slug}'`);
}
function validFiles(files) {
  if (typeof files !== "object" || files === null || Array.isArray(files)) {
    throw new CloudError("Invalid", "files must be an object");
  }
  const entries = Object.entries(files);
  if (entries.length === 0) {
    throw new CloudError("Invalid", "cannot save an empty project");
  }
  for (const [path, contents] of entries) {
    if (typeof contents !== "string") {
      throw new CloudError("Invalid", `contents of '${path}' must be a string`);
    }
  }
  return Object.fromEntries(entries);
}
async function getLock(sql, slug) {
  const rows = await sql`
        select l.holder, l.session_id, l.since
        from project_edit_lock l
        join project p on p.id = l.project_id
        where p.slug = ${slug}
          and l.since > now() - make_interval(secs => ${lockTtlMs / 1e3})
    `;
  if (rows.length === 0) {
    return void 0;
  }
  return {
    holder: rows[0].holder,
    sessionId: rows[0].session_id,
    since: rows[0].since.toISOString()
  };
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
async function body(request) {
  try {
    const parsed = await request.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new CloudError("Invalid", "body must be a JSON object");
    }
    return parsed;
  } catch (err) {
    if (err instanceof CloudError) {
      throw err;
    }
    throw new CloudError("Invalid", "body must be valid JSON");
  }
}
function requireString(source, field) {
  const value = source[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new CloudError("Invalid", `${field} is required`);
  }
  return value.trim();
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
function POST(request) {
  return handle(async () => {
    const { slug } = target(request);
    const fields = await body(request);
    const info = await addVersion(connect(), slug, {
      files: fields.files,
      author: requireString(fields, "author"),
      note: typeof fields.note === "string" ? fields.note : "",
      sessionId: requireString(fields, "sessionId")
    });
    return json(info, 201);
  });
}
export {
  GET,
  POST
};
