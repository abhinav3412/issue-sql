const mysql = require("mysql2/promise");
const { Pool } = require("pg");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

let dbAdapter;

function readEnv(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return "";
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

function hasDatabaseConfig() {
  const hasUrl = Boolean(readEnv("DATABASE_URL"));
  const hasParts = Boolean(
    readEnv("DB_HOST") &&
    readEnv("DB_USER") &&
    readEnv("DB_NAME")
  );
  return hasUrl || hasParts;
}

function assertDatabaseConfig() {
  if (hasDatabaseConfig()) return;
  throw new Error(
    "Database config missing. Set DATABASE_URL or DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT."
  );
}

function detectClient() {
  const explicit = readEnv("DB_CLIENT").toLowerCase();
  if (explicit === "sqlite" || explicit === "mysql" || explicit === "postgres" || explicit === "postgresql") {
    return explicit === "postgresql" ? "postgres" : explicit;
  }
  const url = readEnv("DATABASE_URL").toLowerCase();
  if (url.startsWith("mysql://")) return "mysql";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  return "sqlite";
}

function parseQueryArgs(paramsOrCb, cb) {
  const params = typeof paramsOrCb === "function"
    ? []
    : Array.isArray(paramsOrCb)
      ? paramsOrCb
      : paramsOrCb == null
        ? []
        : [paramsOrCb];
  const callback = typeof paramsOrCb === "function"
    ? paramsOrCb
    : typeof cb === "function"
      ? cb
      : () => {};
  return { params, callback };
}

function toPgPlaceholders(sql) {
  let index = 0;
  return String(sql).replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

function stripWrappingQuotes(value) {
  const v = String(value || "").trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'")) ||
    (v.startsWith("`") && v.endsWith("`"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function parsePragmaTableInfo(sql) {
  const m = String(sql).match(/^\s*PRAGMA\s+table_info\(([^)]+)\)\s*;?\s*$/i);
  if (!m) return null;
  const raw = stripWrappingQuotes(m[1]);
  const [schemaPart, tablePart] = raw.includes(".") ? raw.split(".", 2) : ["public", raw];
  return {
    schema: stripWrappingQuotes(schemaPart) || "public",
    table: stripWrappingQuotes(tablePart),
  };
}

function normalizeSqlForPostgres(sql) {
  let text = String(sql || "");
  let convertedInsertIgnore = false;

  text = text.replace(/\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b/gi, "BIGSERIAL PRIMARY KEY");
  text = text.replace(/\bAUTOINCREMENT\b/gi, "");
  text = text.replace(/\bdatetime\('now'\)\b/gi, "CURRENT_TIMESTAMP");
  text = text.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, () => {
    convertedInsertIgnore = true;
    return "INSERT INTO";
  });

  if (convertedInsertIgnore && !/\bON\s+CONFLICT\b/i.test(text)) {
    const trimmed = text.trim();
    text = trimmed.endsWith(";")
      ? `${trimmed.slice(0, -1)} ON CONFLICT DO NOTHING;`
      : `${trimmed} ON CONFLICT DO NOTHING`;
  }

  return text;
}

function maybeAddReturningClause(sql) {
  const text = String(sql || "");
  if (!/^\s*INSERT\s+INTO\b/i.test(text)) return text;
  if (/\bRETURNING\b/i.test(text)) return text;
  const trimmed = text.trim();
  return trimmed.endsWith(";")
    ? `${trimmed.slice(0, -1)} RETURNING *;`
    : `${trimmed} RETURNING *`;
}

function demoFallbackEnabled() {
  return readEnv("DB_DEMO_FALLBACK").toLowerCase() === "true";
}

function withDemoFallbackRun(callback) {
  const ctx = { lastID: 0, changes: 0 };
  callback.call(ctx, null);
}

function createSQLiteAdapter() {
  const dbPath = path.join(process.cwd(), "database", "agf_database.db");
  const sqlite = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error("SQLite open error:", err.message);
    } else {
      console.log("Connected to SQLite database at", dbPath);
    }
  });

  return {
    type: "sqlite",
    serialize(fn) {
      if (typeof fn === "function") sqlite.serialize(fn);
    },
    prepare(sql) {
      return sqlite.prepare(sql);
    },
    exec(sql, cb) {
      sqlite.exec(sql, cb);
      return this;
    },
    run(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      sqlite.run(sql, params, function (err) {
        if (err) return callback(err);
        callback.call(this, null);
      });
      return this;
    },
    get(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      sqlite.get(sql, params, callback);
      return this;
    },
    all(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      sqlite.all(sql, params, callback);
      return this;
    },
    close(cb) {
      sqlite.close(cb);
    },
  };
}

function createDemoAdapter() {
  console.warn("DB demo fallback enabled: using no-op adapter.");
  return {
    type: "demo",
    serialize(fn) {
      if (typeof fn === "function") fn();
    },
    prepare() {
      return {
        run(paramsOrCb, cb) {
          const callback = typeof paramsOrCb === "function" ? paramsOrCb : cb;
          if (typeof callback === "function") withDemoFallbackRun(callback);
        },
        finalize(cb2) {
          if (typeof cb2 === "function") cb2(null);
        },
      };
    },
    exec(sql, cb) {
      if (typeof cb === "function") cb(null);
      return this;
    },
    run(sql, paramsOrCb, cb) {
      const { callback } = parseQueryArgs(paramsOrCb, cb);
      withDemoFallbackRun(callback);
      return this;
    },
    get(sql, paramsOrCb, cb) {
      const { callback } = parseQueryArgs(paramsOrCb, cb);
      callback(null, undefined);
      return this;
    },
    all(sql, paramsOrCb, cb) {
      const { callback } = parseQueryArgs(paramsOrCb, cb);
      callback(null, []);
      return this;
    },
    close(cb) {
      if (typeof cb === "function") cb(null);
    },
  };
}

function createMySQLAdapter() {
  assertDatabaseConfig();
  const databaseUrl = readEnv("DATABASE_URL");
  const pool = databaseUrl
    ? mysql.createPool(databaseUrl)
    : mysql.createPool({
        host: readEnv("DB_HOST"),
        user: readEnv("DB_USER"),
        password: readEnv("DB_PASSWORD") || "",
        database: readEnv("DB_NAME"),
        port: Number(readEnv("DB_PORT") || 3306),
        waitForConnections: true,
        connectionLimit: Number(readEnv("DB_POOL_SIZE") || 10),
      });
  console.log("Connected to MySQL database");

  const adapter = {
    type: "mysql",
    serialize(fn) {
      if (typeof fn === "function") fn();
    },
    prepare(sql) {
      return {
        run(paramsOrCb, cb) {
          return adapter.run(sql, paramsOrCb, cb);
        },
        finalize(cb2) {
          if (typeof cb2 === "function") cb2(null);
        },
      };
    },
    exec(sql, cb) {
      return adapter.run(sql, [], cb);
    },
    run(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      pool.query(sql, params)
        .then(([result]) => {
          const ctx = {
            lastID: result && typeof result.insertId === "number" ? result.insertId : undefined,
            changes: result && typeof result.affectedRows === "number" ? result.affectedRows : 0,
          };
          callback.call(ctx, null);
        })
        .catch((err) => {
          if (demoFallbackEnabled()) return withDemoFallbackRun(callback);
          callback(err);
        });
      return adapter;
    },
    get(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      pool.query(sql, params)
        .then(([rows]) => callback(null, Array.isArray(rows) ? (rows[0] || undefined) : undefined))
        .catch((err) => {
          if (demoFallbackEnabled()) return callback(null, undefined);
          callback(err);
        });
      return adapter;
    },
    all(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      pool.query(sql, params)
        .then(([rows]) => callback(null, Array.isArray(rows) ? rows : []))
        .catch((err) => {
          if (demoFallbackEnabled()) return callback(null, []);
          callback(err);
        });
      return adapter;
    },
    close(cb) {
      pool.end()
        .then(() => {
          if (typeof cb === "function") cb(null);
        })
        .catch((err) => {
          if (typeof cb === "function") cb(err);
        });
    },
  };

  return adapter;
}

function createPostgresAdapter() {
  assertDatabaseConfig();
  const dbUrlRaw = readEnv("DATABASE_URL");
  const dbHost = readEnv("DB_HOST");
  const isSupabase = /supabase\.com/i.test(dbUrlRaw) || /supabase\.com/i.test(dbHost);
  const urlSslMode = (() => {
    try {
      if (!dbUrlRaw) return "";
      return new URL(dbUrlRaw).searchParams.get("sslmode") || "";
    } catch {
      return "";
    }
  })().toLowerCase();
  const sslEnabled =
    readEnv("DB_SSL").toLowerCase() === "true" ||
    /sslmode=require/i.test(dbUrlRaw) ||
    isSupabase ||
    urlSslMode === "require" ||
    urlSslMode === "verify-ca" ||
    urlSslMode === "verify-full" ||
    urlSslMode === "no-verify";
  const rejectUnauthorizedEnv = readEnv("DB_SSL_REJECT_UNAUTHORIZED").toLowerCase();
  const urlNoVerify = urlSslMode === "no-verify";
  const sslCa = readEnv("DB_SSL_CA");
  const strictSsl = readEnv("DB_SSL_STRICT").toLowerCase() === "true";
  const rejectUnauthorized = rejectUnauthorizedEnv
    ? rejectUnauthorizedEnv !== "false"
    : (strictSsl || Boolean(sslCa) ? true : false);
  const ssl = sslEnabled
    ? (sslCa
      ? { rejectUnauthorized, ca: sslCa.replace(/\\n/g, "\n") }
      : { rejectUnauthorized })
    : undefined;

  // Ensure pg does not silently pick stricter SSL semantics from ambient env.
  if (sslEnabled) {
    process.env.PGSSLMODE = rejectUnauthorized ? "verify-full" : "no-verify";
    if (!rejectUnauthorized) {
      delete process.env.PGSSLROOTCERT;
      delete process.env.PGSSLCERT;
      delete process.env.PGSSLKEY;
    }
  }
  const baseConfig = {
    max: Number(readEnv("DB_POOL_SIZE") || 10),
    ssl,
  };

  let poolConfig = null;
  if (dbUrlRaw) {
    try {
      const parsed = new URL(dbUrlRaw);
      poolConfig = {
        ...baseConfig,
        host: parsed.hostname,
        port: Number(parsed.port || 5432),
        user: decodeURIComponent(parsed.username || ""),
        password: decodeURIComponent(parsed.password || ""),
        database: decodeURIComponent((parsed.pathname || "/").replace(/^\//, "")) || "postgres",
      };
    } catch (e) {
      throw new Error("Invalid DATABASE_URL format. Please provide a valid postgres connection URL.");
    }
  }

  if (sslEnabled && !rejectUnauthorized) {
    // Last-resort compatibility mode for providers/chains that fail cert validation in serverless.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const pool = new Pool(
    poolConfig || {
      ...baseConfig,
      host: readEnv("DB_HOST"),
      user: readEnv("DB_USER"),
      password: readEnv("DB_PASSWORD") || "",
      database: readEnv("DB_NAME"),
      port: Number(readEnv("DB_PORT") || 5432),
    }
  );
  console.log("Connected to PostgreSQL database");

  const adapter = {
    type: "postgres",
    serialize(fn) {
      if (typeof fn === "function") fn();
    },
    prepare(sql) {
      return {
        run(paramsOrCb, cb) {
          return adapter.run(sql, paramsOrCb, cb);
        },
        finalize(cb2) {
          if (typeof cb2 === "function") cb2(null);
        },
      };
    },
    exec(sql, cb) {
      return adapter.run(sql, [], cb);
    },
    run(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      const normalized = normalizeSqlForPostgres(sql);
      const withReturning = maybeAddReturningClause(normalized);
      const text = toPgPlaceholders(withReturning);
      pool.query(text, params)
        .then((result) => {
          const ctx = {
            lastID: result && result.rows && result.rows[0] ? result.rows[0].id : undefined,
            changes: result && typeof result.rowCount === "number" ? result.rowCount : 0,
          };
          callback.call(ctx, null);
        })
        .catch((err) => {
          if (demoFallbackEnabled()) return withDemoFallbackRun(callback);
          callback(err);
        });
      return adapter;
    },
    get(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      const pragma = parsePragmaTableInfo(sql);
      if (pragma) {
        const pragmaSql = `
          SELECT
            (cols.ordinal_position - 1) AS cid,
            cols.column_name AS name,
            cols.data_type AS type,
            CASE WHEN cols.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
            cols.column_default AS dflt_value,
            CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 1 ELSE 0 END AS pk
          FROM information_schema.columns cols
          LEFT JOIN information_schema.key_column_usage kcu
            ON kcu.table_schema = cols.table_schema
           AND kcu.table_name = cols.table_name
           AND kcu.column_name = cols.column_name
          LEFT JOIN information_schema.table_constraints tc
            ON tc.constraint_schema = kcu.constraint_schema
           AND tc.table_name = kcu.table_name
           AND tc.constraint_name = kcu.constraint_name
          WHERE cols.table_schema = $1
            AND cols.table_name = $2
          ORDER BY cols.ordinal_position
        `;
        pool.query(pragmaSql, [pragma.schema, pragma.table])
          .then((result) => callback(null, result.rows && result.rows[0] ? result.rows[0] : undefined))
          .catch((err) => callback(err));
        return adapter;
      }
      const normalized = normalizeSqlForPostgres(sql);
      const text = toPgPlaceholders(normalized);
      pool.query(text, params)
        .then((result) => callback(null, result.rows && result.rows[0] ? result.rows[0] : undefined))
        .catch((err) => {
          if (demoFallbackEnabled()) return callback(null, undefined);
          callback(err);
        });
      return adapter;
    },
    all(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      const pragma = parsePragmaTableInfo(sql);
      if (pragma) {
        const pragmaSql = `
          SELECT
            (cols.ordinal_position - 1) AS cid,
            cols.column_name AS name,
            cols.data_type AS type,
            CASE WHEN cols.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
            cols.column_default AS dflt_value,
            CASE WHEN tc.constraint_type = 'PRIMARY KEY' THEN 1 ELSE 0 END AS pk
          FROM information_schema.columns cols
          LEFT JOIN information_schema.key_column_usage kcu
            ON kcu.table_schema = cols.table_schema
           AND kcu.table_name = cols.table_name
           AND kcu.column_name = cols.column_name
          LEFT JOIN information_schema.table_constraints tc
            ON tc.constraint_schema = kcu.constraint_schema
           AND tc.table_name = kcu.table_name
           AND tc.constraint_name = kcu.constraint_name
          WHERE cols.table_schema = $1
            AND cols.table_name = $2
          ORDER BY cols.ordinal_position
        `;
        pool.query(pragmaSql, [pragma.schema, pragma.table])
          .then((result) => callback(null, result.rows || []))
          .catch((err) => callback(err));
        return adapter;
      }
      const normalized = normalizeSqlForPostgres(sql);
      const text = toPgPlaceholders(normalized);
      pool.query(text, params)
        .then((result) => callback(null, result.rows || []))
        .catch((err) => {
          if (demoFallbackEnabled()) return callback(null, []);
          callback(err);
        });
      return adapter;
    },
    close(cb) {
      pool.end()
        .then(() => {
          if (typeof cb === "function") cb(null);
        })
        .catch((err) => {
          if (typeof cb === "function") cb(err);
        });
    },
  };

  return adapter;
}

function getDB() {
  if (!dbAdapter) {
    try {
      const client = detectClient();
      if (client === "mysql") dbAdapter = createMySQLAdapter();
      else if (client === "postgres") dbAdapter = createPostgresAdapter();
      else dbAdapter = createSQLiteAdapter();
    } catch (err) {
      if (demoFallbackEnabled()) {
        console.warn("Primary DB init failed; switching to demo adapter:", err.message);
        dbAdapter = createDemoAdapter();
      } else {
        throw err;
      }
    }
  }
  return dbAdapter;
}

/** Returns current server local time as "YYYY-MM-DD HH:MM:SS" for storing in DB so display matches when the action happened. */
function getLocalDateTimeString(dateObj = new Date()) {
  const d = dateObj;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

/** Returns current UTC time as "YYYY-MM-DD HH:MM:SS" for storing in DB to avoid timezone issues. */
function getUTCDateTimeString(dateObj = new Date()) {
  const d = dateObj;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

// Export based on your choice
module.exports = {
  getDB,
  getLocalDateTimeString,
  getUTCDateTimeString,
};
