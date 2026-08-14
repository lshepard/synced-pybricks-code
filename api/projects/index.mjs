// src/cloud/db.ts
import { neon } from "@neondatabase/serverless";

// src/cloud/protocol.ts
var lockTtlMs = 20 * 60 * 1e3;
function slugify(name) {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
}

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
    archived: row.archived
  };
}
async function getProjects(sql) {
  const rows = await sql`
        select slug, name, created_at, updated_at, archived
        from project
        order by updated_at desc
    `;
  return rows.map(toProject);
}
async function createProject(sql, name) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  const base = slugify(trimmed) || "project";
  for (let attempt = 0; ; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const rows = await sql`
            insert into project (slug, name)
            values (${slug}, ${trimmed})
            on conflict (slug) do nothing
            returning slug, name, created_at, updated_at, archived
        `;
    if (rows.length > 0) {
      return toProject(rows[0]);
    }
    if (attempt > 100) {
      throw new CloudError("Invalid", "could not find an unused name");
    }
  }
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

// src/cloud/routes/projects/index.ts
function GET() {
  return handle(async () => json(await getProjects(connect())));
}
function POST(request) {
  return handle(async () => {
    const fields = await body(request);
    const name = requireString(fields, "name");
    return json(await createProject(connect(), name), 201);
  });
}
export {
  GET,
  POST
};
