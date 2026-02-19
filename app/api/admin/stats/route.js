import { NextResponse } from "next/server";
const { getDB } = require("../../../../database/db");

const ACTIVITY_LOG_TABLE = `
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type VARCHAR(50) NOT NULL,
    message VARCHAR(500) NOT NULL,
    entity_type VARCHAR(20),
    entity_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`;

const ANALYTICS_WINDOW_DAYS = 14;
const HEATMAP_MAX_POINTS = 600;

const toDateOnlyString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toDateTimeString = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
};

const buildDateRange = (days) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(toDateOnlyString(d));
  }
  return dates;
};

const normalizeMinutes = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
};

async function ensureServiceRequestColumns(db) {
  const cols = [
    "payment_method VARCHAR(20) DEFAULT 'ONLINE'",
    "payment_status VARCHAR(30) DEFAULT 'PAID'",
    "cod_failure_reason VARCHAR(200)",
    "user_lat REAL",
    "user_lon REAL",
    "assigned_worker INTEGER",
    "fuel_station_id INTEGER",
    "payment_id VARCHAR(100)",
    "payment_details TEXT",
  ];
  await Promise.all(
    cols.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE service_requests ADD COLUMN ${col}`, (err) => {
            if (err && !/duplicate column name/i.test(err.message)) {
              console.error(`Add service_requests.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
}

async function ensureWorkerColumns(db) {
  const cols = [
    "service_type VARCHAR(50)",
    "latitude REAL",
    "longitude REAL",
  ];
  await Promise.all(
    cols.map(
      (col) =>
        new Promise((resolve) => {
          db.run(`ALTER TABLE workers ADD COLUMN ${col}`, (err) => {
            if (err && !/duplicate column name/i.test(err.message)) {
              console.error(`Add workers.${col} failed:`, err);
            }
            resolve();
          });
        })
    )
  );
}

export async function GET(request) {
  try {
    const db = getDB();
    const url = request.url ? new URL(request.url) : null;
    const dateParam = url?.searchParams?.get("date") ?? null; // YYYY-MM-DD for activity filter
    const filterByDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);

    await new Promise((resolve, reject) => {
      db.run(ACTIVITY_LOG_TABLE, (err) => (err ? reject(err) : resolve()));
    });

    // Ensure service request timeline columns exist (older DBs won't have them).
    await Promise.all(
      ["assigned_at", "in_progress_at", "completed_at", "cancelled_at"].map(
        (col) =>
          new Promise((resolve) => {
            db.run(`ALTER TABLE service_requests ADD COLUMN ${col} DATETIME`, (err) => {
              if (err && !/duplicate column name/i.test(err.message)) {
                console.error(`Add service_requests.${col} failed:`, err);
              }
              resolve();
            });
          })
      )
    );
    await ensureServiceRequestColumns(db);
    await ensureWorkerColumns(db);

    const totalUsers = await new Promise((resolve, reject) => {
      db.get(
        `SELECT COUNT(*) as count
         FROM users
         WHERE role = 'User'
           AND NOT EXISTS (
             SELECT 1 FROM fuel_stations fs WHERE fs.user_id = users.id
           )`,
        [],
        (err, row) => {
        if (err) reject(err);
        else resolve(row?.count ?? 0);
        }
      );
    });
    const totalWorkers = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM workers", [], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count ?? 0);
      });
    });
    const activeWorkers = await new Promise((resolve, reject) => {
      db.get("SELECT COUNT(*) as count FROM workers WHERE status IN ('Available', 'Busy')", [], (err, row) => {
        if (err) reject(err);
        else resolve(row?.count ?? 0);
      });
    });

    const recentUsers = await new Promise((resolve, reject) => {
      if (filterByDate) {
        db.all(
          `SELECT id, email, first_name, last_name, created_at
           FROM users
           WHERE role = 'User'
             AND DATE(created_at) = ?
             AND NOT EXISTS (
               SELECT 1 FROM fuel_stations fs WHERE fs.user_id = users.id
             )
           ORDER BY created_at DESC LIMIT 50`,
          [dateParam],
          (err, rows) => (err ? reject(err) : resolve(rows ?? []))
        );
      } else {
        db.all(
          `SELECT id, email, first_name, last_name, created_at
           FROM users
           WHERE role = 'User'
             AND NOT EXISTS (
               SELECT 1 FROM fuel_stations fs WHERE fs.user_id = users.id
             )
           ORDER BY created_at DESC LIMIT 10`,
          [],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows ?? []);
          }
        );
      }
    });
    const recentWorkersWithDate = await new Promise((resolve, reject) => {
      if (filterByDate) {
        db.all(
          "SELECT id, first_name, last_name, status, created_at FROM workers WHERE DATE(created_at) = ? ORDER BY created_at DESC LIMIT 50",
          [dateParam],
          (err, rows) => (err ? reject(err) : resolve(rows ?? []))
        );
      } else {
        db.all("SELECT id, first_name, last_name, status, created_at FROM workers ORDER BY created_at DESC LIMIT 10", [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        });
      }
    });
    const recentWorkersForPanel = await new Promise((resolve, reject) => {
      db.all(
        "SELECT id, first_name, last_name, status, latitude, longitude, service_type FROM workers WHERE status IN ('Available', 'Busy') ORDER BY id DESC LIMIT 10",
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        }
      );
    });
    const serviceRequests = await new Promise((resolve, reject) => {
      db.all(
        `SELECT sr.id,
                sr.user_id,
                sr.vehicle_number,
                sr.service_type,
                sr.amount,
                sr.status,
                sr.created_at,
                sr.assigned_at,
                sr.in_progress_at,
                sr.completed_at,
                sr.cancelled_at,
                sr.user_lat,
                sr.user_lon,
                sr.assigned_worker,
                sr.payment_method,
                sr.payment_status,
                sr.payment_id,
                u.first_name,
                u.last_name,
                u.phone_number,
                w.first_name AS worker_first_name,
                w.last_name AS worker_last_name,
                w.phone_number AS worker_phone,
                w.status AS worker_status,
                w.latitude AS worker_latitude,
                w.longitude AS worker_longitude
         FROM service_requests sr 
         LEFT JOIN users u ON sr.user_id = u.id
         LEFT JOIN workers w ON sr.assigned_worker = w.id
         ORDER BY sr.created_at DESC LIMIT 20`,
        [],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });
    const activeRequestsCount = await new Promise((resolve, reject) => {
      db.get(
        "SELECT COUNT(*) as count FROM service_requests WHERE status IN ('Pending', 'Assigned', 'In Progress')",
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count ?? 0);
        }
      );
    });
    const activityLog = await new Promise((resolve, reject) => {
      if (filterByDate) {
        db.all(
          "SELECT id, type, message, created_at FROM activity_log WHERE DATE(created_at) = ? ORDER BY created_at DESC LIMIT 50",
          [dateParam],
          (err, rows) => (err ? reject(err) : resolve(rows ?? []))
        );
      } else {
        db.all("SELECT id, type, message, created_at FROM activity_log ORDER BY created_at DESC LIMIT 15", [], (err, rows) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        });
      }
    });

    const analyticsStart = new Date();
    analyticsStart.setHours(0, 0, 0, 0);
    analyticsStart.setDate(analyticsStart.getDate() - (ANALYTICS_WINDOW_DAYS - 1));
    const analyticsStartStr = toDateTimeString(analyticsStart);
    const dateRange = buildDateRange(ANALYTICS_WINDOW_DAYS);

    const requestsPerDayRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(created_at) as day, COUNT(*) as count
         FROM service_requests
         WHERE created_at >= ?
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`,
        [analyticsStartStr],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    const codFailuresRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(COALESCE(cancelled_at, created_at)) as day, COUNT(*) as count
         FROM service_requests
         WHERE payment_status = 'FAILED_COD'
           AND COALESCE(cancelled_at, created_at) >= ?
         GROUP BY DATE(COALESCE(cancelled_at, created_at))
         ORDER BY DATE(COALESCE(cancelled_at, created_at))`,
        [analyticsStartStr],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    const avgEtaRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(created_at) as day,
                AVG((julianday(completed_at) - julianday(created_at)) * 24 * 60) as avg_minutes
         FROM service_requests
         WHERE completed_at IS NOT NULL
           AND created_at >= ?
         GROUP BY DATE(created_at)
         ORDER BY DATE(created_at)`,
        [analyticsStartStr],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    const avgEtaOverallRow = await new Promise((resolve) => {
      db.get(
        `SELECT AVG((julianday(completed_at) - julianday(created_at)) * 24 * 60) as avg_minutes
         FROM service_requests
         WHERE completed_at IS NOT NULL
           AND created_at >= ?`,
        [analyticsStartStr],
        (err, row) => {
          if (err) return resolve(null);
          resolve(row || null);
        }
      );
    });

    const workerStatusRows = await new Promise((resolve, reject) => {
      db.all(
        "SELECT status, COUNT(*) as count FROM workers GROUP BY status",
        [],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    const cancellationHeatRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT user_lat as lat, user_lon as lng
         FROM service_requests
         WHERE status = 'Cancelled'
           AND user_lat IS NOT NULL
           AND user_lon IS NOT NULL
         ORDER BY cancelled_at DESC
         LIMIT ?`,
        [HEATMAP_MAX_POINTS],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    const failureHeatRows = await new Promise((resolve, reject) => {
      db.all(
        `SELECT user_lat as lat, user_lon as lng
         FROM service_requests
         WHERE payment_status = 'FAILED_COD'
           AND user_lat IS NOT NULL
           AND user_lon IS NOT NULL
         ORDER BY cancelled_at DESC
         LIMIT ?`,
        [HEATMAP_MAX_POINTS],
        (err, rows) => (err ? reject(err) : resolve(rows ?? []))
      );
    });

    const requestsByDay = new Map(
      (requestsPerDayRows || []).map((row) => [row.day, Number(row.count || 0)])
    );
    const codFailuresByDay = new Map(
      (codFailuresRows || []).map((row) => [row.day, Number(row.count || 0)])
    );
    const avgEtaByDay = new Map(
      (avgEtaRows || []).map((row) => [row.day, normalizeMinutes(Number(row.avg_minutes || 0))])
    );

    const requestsPerDay = dateRange.map((date) => ({
      date,
      count: requestsByDay.get(date) || 0,
    }));
    const codFailuresPerDay = dateRange.map((date) => ({
      date,
      count: codFailuresByDay.get(date) || 0,
    }));
    const avgEtaPerDay = dateRange.map((date) => ({
      date,
      minutes: avgEtaByDay.get(date) || 0,
    }));

    const statusCounts = { Available: 0, Busy: 0, Offline: 0 };
    (workerStatusRows || []).forEach((row) => {
      if (!row?.status) return;
      statusCounts[row.status] = Number(row.count || 0);
    });
    const workerUtilization = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));
    const utilizationPercent = totalWorkers
      ? Math.round((statusCounts.Busy / totalWorkers) * 100)
      : 0;

    const cancellationHeat = (cancellationHeatRows || [])
      .map((row) => ({
        lat: Number(row.lat),
        lng: Number(row.lng),
        intensity: 0.8,
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    const failureHeat = (failureHeatRows || [])
      .map((row) => ({
        lat: Number(row.lat),
        lng: Number(row.lng),
        intensity: 0.9,
      }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

    const userActivities = (recentUsers || []).map((u) => ({
      type: "user_registered",
      message: `${u.first_name} ${u.last_name} joined the platform`,
      created_at: u.created_at,
      first_name: u.first_name,
      last_name: u.last_name,
    }));
    const workerCreatedActivities = (recentWorkersWithDate || []).map((w) => ({
      type: "worker_created",
      message: `Worker ${w.first_name} ${w.last_name} joined`,
      created_at: w.created_at,
      first_name: w.first_name,
      last_name: w.last_name,
    }));
    const logActivities = (activityLog || []).map((a) => ({
      type: a.type,
      message: a.message,
      created_at: a.created_at,
    }));
    const recentActivity = [...userActivities, ...workerCreatedActivities, ...logActivities]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    const rangeParam = url?.searchParams?.get("range") || "daily"; // daily, weekly, monthly, all
    let rangeStartDate = new Date();
    rangeStartDate.setHours(0, 0, 0, 0);

    if (rangeParam === "weekly") {
      rangeStartDate.setDate(rangeStartDate.getDate() - 7);
    } else if (rangeParam === "monthly") {
      rangeStartDate.setDate(rangeStartDate.getDate() - 30);
    } else if (rangeParam === "all") {
      rangeStartDate = new Date(0); // Epoch
    }
    // Default 'daily' uses today 00:00:00 (set above)

    const rangeStartDateStr = toDateTimeString(rangeStartDate);

    // --- NEW: Financial Analytics ---
    const financialStats = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
           SUM(CASE WHEN payment_method = 'ONLINE' THEN amount ELSE 0 END) as online_earnings,
           SUM(CASE WHEN payment_method = 'COD' THEN amount ELSE 0 END) as cod_earnings,
           SUM(amount) as total_earnings
         FROM service_requests
         WHERE status = 'Completed'
           AND payment_status = 'PAID'
           AND completed_at >= ?`,
        [rangeStartDateStr],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows[0] || { online_earnings: 0, cod_earnings: 0, total_earnings: 0 });
        }
      );
    });

    const workerFinancials = await new Promise((resolve, reject) => {
      db.all(
        `SELECT
           w.id,
           w.first_name,
           w.last_name,
           w.service_type,
           w.floater_cash as current_float,
           COALESCE(SUM(CASE WHEN sr.payment_method = 'ONLINE' AND sr.status = 'Completed' AND sr.payment_status = 'PAID' AND sr.completed_at >= ? THEN sr.amount ELSE 0 END), 0) as online_earnings,
           COALESCE(SUM(CASE WHEN sr.payment_method = 'COD' AND sr.status = 'Completed' AND sr.payment_status = 'PAID' AND sr.completed_at >= ? THEN sr.amount ELSE 0 END), 0) as cod_earnings
         FROM workers w
         LEFT JOIN service_requests sr ON w.id = sr.assigned_worker
         GROUP BY w.id`,
        [rangeStartDateStr, rangeStartDateStr],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });

    return NextResponse.json({
      totalUsers,
      totalWorkers,
      activeWorkers,
      activeRequests: activeRequestsCount,
      recentUsers,
      recentActivity,
      activeWorkersList: recentWorkersForPanel,
      serviceRequests,
      analytics: {
        windowDays: ANALYTICS_WINDOW_DAYS,
        requestsPerDay,
        codFailuresPerDay,
        avgEtaPerDay,
        avgEtaMinutes: normalizeMinutes(Number(avgEtaOverallRow?.avg_minutes || 0)),
        workerUtilization,
        utilizationPercent,
      },
      heatmaps: {
        cancellations: cancellationHeat,
        failures: failureHeat,
      },
      financials: {
        range: rangeParam,
        totalEarnings: financialStats.total_earnings || 0,
        onlineEarnings: financialStats.online_earnings || 0,
        codEarnings: financialStats.cod_earnings || 0,
        workerFinancials,
      },
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
