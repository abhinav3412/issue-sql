-- SQL Database Schema for Automotive Grade Fuel (AGF)
-- Supports both SQLite, MySQL, and PostgreSQL

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Use AUTO_INCREMENT for MySQL, SERIAL for PostgreSQL
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    driving_licence VARCHAR(100),
    role VARCHAR(20) DEFAULT 'User' CHECK(role IN ('User', 'Admin', 'Fuel_Station')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Workers Table
CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Use AUTO_INCREMENT for MySQL, SERIAL for PostgreSQL
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    service_type VARCHAR(50),
    latitude REAL,
    longitude REAL,
    status VARCHAR(20) DEFAULT 'Available' CHECK(status IN ('Available', 'Busy', 'Offline')),
    status_locked INTEGER DEFAULT 0,
    verified INTEGER DEFAULT 0,
    floater_cash REAL DEFAULT 0.0,
    last_cash_collection_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity log for Recent Activity feed (worker deleted, etc.)
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type VARCHAR(50) NOT NULL,
    message VARCHAR(500) NOT NULL,
    entity_type VARCHAR(20),
    entity_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Service Types (petrol, diesel, crane, mechanic bike/car with amounts)
CREATE TABLE IF NOT EXISTS service_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100) NOT NULL,
    amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO service_types (code, label, amount) VALUES
    ('petrol', 'Petrol', 100),
    ('diesel', 'Diesel', 150),
    ('crane', 'Crane', 200),
    ('mechanic_bike', 'Mechanic (Bike)', 300),
    ('mechanic_car', 'Mechanic (Car)', 300);

-- Service Requests Table (user portal)
CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    vehicle_number VARCHAR(50) NOT NULL,
    driving_licence VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    amount INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'Pending' CHECK(status IN ('Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Fuel Stations Table
CREATE TABLE IF NOT EXISTS fuel_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    station_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    address TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    cod_enabled INTEGER DEFAULT 1,
    cod_current_balance REAL DEFAULT 0,
    cod_balance_limit REAL DEFAULT 50000,
    is_verified INTEGER DEFAULT 0,
    is_open INTEGER DEFAULT 1,
    platform_trust_flag INTEGER DEFAULT 0,
    total_earnings REAL DEFAULT 0,
    pending_payout REAL DEFAULT 0,
    last_stock_update DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Fuel Station Stock Table
CREATE TABLE IF NOT EXISTS fuel_station_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fuel_station_id INTEGER NOT NULL,
    fuel_type VARCHAR(50) NOT NULL,
    stock_litres REAL DEFAULT 0,
    last_refilled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fuel_station_id, fuel_type),
    FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id)
);

-- Fuel Station Ledger Table
CREATE TABLE IF NOT EXISTS fuel_station_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fuel_station_id INTEGER NOT NULL,
    settlement_id INTEGER,
    transaction_type VARCHAR(50) NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    running_balance REAL DEFAULT 0,
    status VARCHAR(30) DEFAULT 'pending',
    reference_id VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id),
    FOREIGN KEY (settlement_id) REFERENCES settlements(id)
);

-- COD Settlements Table
CREATE TABLE IF NOT EXISTS cod_settlements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    service_request_id INTEGER NOT NULL,
    fuel_station_id INTEGER NOT NULL,
    worker_id INTEGER NOT NULL,
    customer_paid_amount REAL NOT NULL,
    fuel_cost REAL NOT NULL,
    fuel_station_payout REAL NOT NULL,
    platform_fee REAL DEFAULT 0,
    collection_method VARCHAR(50) DEFAULT 'pending',
    payment_status VARCHAR(30) DEFAULT 'pending',
    collected_at DATETIME,
    settled_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (service_request_id) REFERENCES service_requests(id),
    FOREIGN KEY (fuel_station_id) REFERENCES fuel_stations(id),
    FOREIGN KEY (worker_id) REFERENCES workers(id)
);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    user_id INTEGER,
    user_role VARCHAR(50),
    old_values TEXT,
    new_values TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_workers_email ON workers(email);
CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_service_types_code ON service_types(code);
CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_created_at ON service_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_user_id ON fuel_stations(user_id);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_email ON fuel_stations(email);
CREATE INDEX IF NOT EXISTS idx_fuel_stations_verified ON fuel_stations(is_verified);
CREATE INDEX IF NOT EXISTS idx_fuel_station_stock_fuel_station ON fuel_station_stock(fuel_station_id);
CREATE INDEX IF NOT EXISTS idx_fuel_station_stock_fuel_type ON fuel_station_stock(fuel_type);
CREATE INDEX IF NOT EXISTS idx_fuel_station_ledger_fuel_station ON fuel_station_ledger(fuel_station_id);
CREATE INDEX IF NOT EXISTS idx_fuel_station_ledger_status ON fuel_station_ledger(status);
CREATE INDEX IF NOT EXISTS idx_fuel_station_ledger_created ON fuel_station_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_fuel_station ON cod_settlements(fuel_station_id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_worker ON cod_settlements(worker_id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_status ON cod_settlements(payment_status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
