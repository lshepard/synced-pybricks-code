// src/cloud/db.ts
import { neon } from "@neondatabase/serverless";

// src/cloud/protocol.ts
var lockTtlMs = 20 * 60 * 1e3;

// src/cloud/db.ts
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
function toProject(row) {
  return {
    slug: row.slug,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    archived: row.archived,
    ...row.last_editor ? { lastEditor: row.last_editor } : {}
  };
}
async function setArchived(sql, slug, archived) {
  const rows = await sql`
        update project set archived = ${archived}
        where slug = ${slug}
        returning slug, name, created_at, updated_at, archived
    `;
  if (rows.length === 0) {
    throw new CloudError("NotFound", `no project '${slug}'`);
  }
  return toProject(rows[0]);
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
function segments(request, after) {
  const { pathname } = new URL(request.url);
  return pathname.slice(pathname.indexOf(after) + after.length).split("/").filter((s) => s !== "");
}

// src/cloud/routes/projects/[slug]/archive.ts
function POST(request) {
  return handle(async () => {
    const slug = segments(request, "/api/projects/")[0] ?? "";
    const fields = await body(request);
    const archived = fields.archived !== false;
    return json(await setArchived(connect(), slug, archived));
  });
}
export {
  POST
};
