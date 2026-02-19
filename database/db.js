const mysql = require("mysql2/promise");
const { Pool } = require("pg");

let dbAdapter;

function detectClient() {
  const explicit = String(process.env.DB_CLIENT || "").trim().toLowerCase();
  if (explicit === "mysql" || explicit === "postgres" || explicit === "postgresql") return explicit;
  const url = String(process.env.DATABASE_URL || "").trim().toLowerCase();
  if (url.startsWith("mysql://")) return "mysql";
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) return "postgres";
  return "postgres";
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

function createMySQLAdapter() {
  const pool = process.env.DATABASE_URL
    ? mysql.createPool(process.env.DATABASE_URL)
    : mysql.createPool({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "agf_database",
        port: Number(process.env.DB_PORT || 3306),
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
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
        .catch((err) => callback(err));
      return adapter;
    },
    get(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      pool.query(sql, params)
        .then(([rows]) => callback(null, Array.isArray(rows) ? (rows[0] || undefined) : undefined))
        .catch((err) => callback(err));
      return adapter;
    },
    all(sql, paramsOrCb, cb) {
      const { params, callback } = parseQueryArgs(paramsOrCb, cb);
      pool.query(sql, params)
        .then(([rows]) => callback(null, Array.isArray(rows) ? rows : []))
        .catch((err) => callback(err));
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
  const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : new Pool({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "agf_database",
        port: Number(process.env.DB_PORT || 5432),
        max: Number(process.env.DB_POOL_SIZE || 10),
      });
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
        .catch((err) => callback(err));
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
        .catch((err) => callback(err));
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
        .catch((err) => callback(err));
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
    const client = detectClient();
    dbAdapter = client === "mysql" ? createMySQLAdapter() : createPostgresAdapter();
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
