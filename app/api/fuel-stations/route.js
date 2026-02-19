import { NextResponse } from 'next/server';
const { getDB, getLocalDateTimeString } = require('../../../database/db');
const bcrypt = require('bcryptjs');

function isDuplicateColumnError(err) {
  return /duplicate column name|already exists|42701|ER_DUP_FIELDNAME/i.test(String(err?.message || ""));
}

async function getTableColumns(db, tableName) {
  const rows = await new Promise((resolve) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, r) => {
      if (err) return resolve([]);
      resolve(r || []);
    });
  });
  return new Set(rows.map((r) => String(r.name || "").toLowerCase()));
}

async function ensureFuelStationTables(db) {
  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS fuel_stations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE,
        name VARCHAR(255),
        station_name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        phone_number VARCHAR(20),
        address TEXT,
        latitude REAL,
        longitude REAL,
        cod_supported INTEGER DEFAULT 1,
        cod_enabled INTEGER DEFAULT 1,
        is_open INTEGER DEFAULT 1,
        is_verified INTEGER DEFAULT 1,
        total_earnings REAL DEFAULT 0,
        pending_payout REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS fuel_station_stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fuel_station_id INTEGER NOT NULL,
        fuel_type VARCHAR(50) NOT NULL,
        stock_litres REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(fuel_station_id, fuel_type)
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  await new Promise((resolve, reject) => {
    db.run(
      `CREATE TABLE IF NOT EXISTS fuel_station_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fuel_station_id INTEGER NOT NULL,
        amount REAL DEFAULT 0,
        status VARCHAR(30) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve())
    );
  });

  const cols = [
    "name VARCHAR(255)",
    "station_name VARCHAR(255)",
    "cod_supported INTEGER DEFAULT 1",
    "cod_enabled INTEGER DEFAULT 1",
    "total_earnings REAL DEFAULT 0",
    "pending_payout REAL DEFAULT 0",
  ];
  for (const col of cols) {
    await new Promise((resolve) => {
      db.run(`ALTER TABLE fuel_stations ADD COLUMN ${col}`, (err) => {
        if (err && !isDuplicateColumnError(err)) {
          console.error(`Add fuel_stations.${col.split(" ")[0]} failed:`, err);
        }
        resolve();
      });
    });
  }
}

export async function GET(request) {
  const db = getDB();
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search');
  const verifiedOnly = searchParams.get('verified_only') === 'true';
  const id = searchParams.get('id');

  try {
    await ensureFuelStationTables(db);
    console.log("GET /api/fuel-stations: Request received");
    const stations = await new Promise((resolve, reject) => {
      let query = `
        SELECT 
          fs.*,
          (SELECT stock_litres FROM fuel_station_stock WHERE fuel_station_id = fs.id AND fuel_type = 'petrol') as petrol_stock,
          (SELECT stock_litres FROM fuel_station_stock WHERE fuel_station_id = fs.id AND fuel_type = 'diesel') as diesel_stock
        FROM fuel_stations fs 
        WHERE 1=1
      `;
      const params = [];

      if (id) {
        query += ` AND fs.id = ?`;
        params.push(id);
      }

      if (verifiedOnly) {
        query += ` AND (fs.is_verified = 1 OR fs.is_verified = 'true')`;
      }

      if (search) {
        query += ` AND (fs.name LIKE ?)`;
        params.push(`%${search}%`);
      }

      query += ` ORDER BY fs.created_at DESC`;

      // Use SELECT * to avoid "no such column" errors if schema is old
      db.all(query, params, (err, rows) => {
        if (err) {
          console.error("GET /api/fuel-stations DB Error:", err);
          reject(err);
        }
        else {
          // Normalize data for frontend compatibility (handle legacy schema)
          const normalized = (rows || []).map(station => ({
            ...station,
            station_name: station.station_name || station.name,
            cod_enabled: station.cod_enabled !== undefined ? station.cod_enabled : station.cod_supported,
            petrol_stock: station.petrol_stock || 0,
            diesel_stock: station.diesel_stock || 0,
            total_earnings: station.total_earnings || 0,
            pending_payout: station.pending_payout || 0,
            // Ensure coordinates are numbers
            latitude: Number(station.latitude),
            longitude: Number(station.longitude)
          }));
          resolve(normalized);
        }
      });
    });
    console.log(`GET /api/fuel-stations: Found ${stations.length} stations`);

    if (id) {
      if (stations.length === 0) {
        return NextResponse.json({ error: 'Station not found' }, { status: 404 });
      }
      return NextResponse.json(stations[0]);
    }

    return NextResponse.json(stations);
  } catch (error) {
    console.error("GET /api/fuel-stations Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json();
  // Support both station_name (new spec) and name (legacy)
  const station_name = body.station_name || body.name || 'Unnamed Station';
  const { latitude, longitude, cod_enabled, email, phone_number, address } = body;
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);

  if (
    latitude === undefined || latitude === null || latitude === '' ||
    longitude === undefined || longitude === null || longitude === '' ||
    !Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const db = getDB();

  try {
    await ensureFuelStationTables(db);
    const stationCols = await getTableColumns(db, "fuel_stations");
    console.log("POST /api/fuel-stations: Creating station", station_name);

    // 1. First create/get user record for the station
    let user_id = null;
    if (email && body.password) {
      // Check if user exists
      const existingUser = await new Promise((resolve, reject) => {
        db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (existingUser) {
        user_id = existingUser.id;
      } else {
        // Create new user with role 'Station'
        const hashedPassword = await bcrypt.hash(body.password, 10);
        const safePhoneNumber = String(phone_number ?? "").trim();
        const insertStationUser = (role) => new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO users (email, password, role, first_name, last_name, phone_number, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, 'Station', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [email, hashedPassword, role, station_name, safePhoneNumber],
            function (err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });

        try {
          user_id = await insertStationUser('Station');
        } catch (err) {
          // Backward compatibility: some older DBs only allow User/Admin in users.role.
          if (String(err?.message || '').includes("role IN ('User', 'Admin')")) {
            user_id = await insertStationUser('User');
          } else {
            throw err;
          }
        }
      }
    }

    // 2. Create the fuel station record
    const insertCols = [];
    const insertVals = [];
    const insertPlaceholders = [];
    const add = (col, val) => {
      if (stationCols.has(col)) {
        insertCols.push(col);
        insertVals.push(val);
        insertPlaceholders.push("?");
      }
    };

    add("name", station_name);
    add("station_name", station_name);
    add("email", email || null);
    add("phone_number", phone_number || null);
    add("address", address || null);
    add("latitude", parsedLatitude);
    add("longitude", parsedLongitude);
    add("cod_supported", cod_enabled ? 1 : 0);
    add("cod_enabled", cod_enabled ? 1 : 0);
    add("is_open", 1);
    add("is_verified", 1);
    add("user_id", user_id);
    add("created_at", getLocalDateTimeString());
    add("updated_at", getLocalDateTimeString());

    if (insertCols.length === 0) {
      throw new Error("fuel_stations schema has no compatible insert columns");
    }

    const result = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO fuel_stations (${insertCols.join(", ")}) VALUES (${insertPlaceholders.join(", ")})`,
        insertVals,
        function (err) {
          if (err) {
            console.error("POST /api/fuel-stations DB Error:", err);
            reject(err);
          }
          else resolve({ id: this.lastID });
        }
      );
    });

    // Initialize stock entries
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO fuel_station_stock (fuel_station_id, fuel_type, stock_litres, updated_at) VALUES (?, 'petrol', 0, CURRENT_TIMESTAMP)`, [result.id], (err) => {
        if (err) console.error("Stock init error (petrol):", err);
        db.run(`INSERT INTO fuel_station_stock (fuel_station_id, fuel_type, stock_litres, updated_at) VALUES (?, 'diesel', 0, CURRENT_TIMESTAMP)`, [result.id], (err2) => {
          if (err2) console.error("Stock init error (diesel):", err2);
          resolve();
        });
      });
    });

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error("Create station error:", error);
    return NextResponse.json({ error: 'Failed to create station' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const body = await request.json();
  const { id, cod_enabled, cod_supported } = body;
  const isEnabled = cod_enabled !== undefined ? cod_enabled : cod_supported;

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const db = getDB();
  try {
    await ensureFuelStationTables(db);
    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE fuel_stations SET cod_supported = ? WHERE id = ?",
        [isEnabled ? 1 : 0, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

  const db = getDB();
  try {
    await ensureFuelStationTables(db);
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM fuel_stations WHERE id = ?", [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Cleanup related data
    await new Promise(resolve => {
      db.run("DELETE FROM fuel_station_stock WHERE fuel_station_id = ?", [id], () => {
        db.run("DELETE FROM fuel_station_ledger WHERE fuel_station_id = ?", [id], () => resolve());
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
