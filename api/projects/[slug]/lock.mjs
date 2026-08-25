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
async function acquireLock(sql, slug, holder, sessionId, force) {
  const rows = await sql`
        insert into project_edit_lock (project_id, holder, session_id)
        select p.id, ${holder.trim()}, ${sessionId}
        from project p
        where p.slug = ${slug}
        on conflict (project_id) do update
            set holder = excluded.holder,
                session_id = excluded.session_id,
                since = now()
            where ${force}
               or project_edit_lock.session_id = ${sessionId}
               or project_edit_lock.since
                  <= now() - make_interval(secs => ${lockTtlMs / 1e3})
        returning holder, session_id, since
    `;
  if (rows.length === 0) {
    throw await describeWriteFailure(sql, slug);
  }
  return {
    holder: rows[0].holder,
    sessionId: rows[0].session_id,
    since: rows[0].since.toISOString()
  };
}
async function releaseLock(sql, slug, sessionId) {
  const rows = await sql`
        delete from project_edit_lock l
        using project p
        where l.project_id = p.id
          and p.slug = ${slug}
          and l.session_id = ${sessionId}
        returning l.project_id
    `;
  return rows.length > 0;
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

// src/cloud/routes/projects/[slug]/lock.ts
function slugOf(request) {
  return segments(request, "/api/projects/")[0] ?? "";
}
function GET(request) {
  return handle(async () => {
    const lock = await getLock(connect(), slugOf(request));
    return json(lock ?? null);
  });
}
function POST(request) {
  return handle(async () => {
    const fields = await body(request);
    const lock = await acquireLock(
      connect(),
      slugOf(request),
      requireString(fields, "holder"),
      requireString(fields, "sessionId"),
      fields.force === true
    );
    return json(lock);
  });
}
function DELETE(request) {
  return handle(async () => {
    const fields = await body(request);
    const released = await releaseLock(
      connect(),
      slugOf(request),
      requireString(fields, "sessionId")
    );
    return json({ released });
  });
}
export {
  DELETE,
  GET,
  POST
};
