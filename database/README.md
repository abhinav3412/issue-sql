# Database Setup Guide

This directory contains SQL schema files for the Automotive Grade Fuel (AGF) application.

## Database Tables

### Users Table
Stores user account information:
- `id` - Primary key (auto-increment)
- `email` - Unique email address
- `password` - Hashed password
- `first_name` - User's first name
- `last_name` - User's last name
- `phone_number` - Contact phone number
- `role` - User role (User or Admin)
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

### Workers Table
Stores worker/service provider information:
- `id` - Primary key (auto-increment)
- `email` - Unique email address
- `password` - Hashed password
- `first_name` - Worker's first name
- `last_name` - Worker's last name
- `phone_number` - Contact phone number
- `status` - Worker status (Available, Busy, Offline)
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

## Admin User

To create the default admin account (admin@gmail.com / admin123) in the database, run from the project root:

```bash
node database/seed-admin.js
```

Ensure the database and tables exist first (run `node database/setup.js` if needed).

## Setup Instructions

### Option 1: SQLite (Simplest - No server needed)

1. Install SQLite3 (usually pre-installed on Mac/Linux, download for Windows)
2. Run the schema:
```bash
sqlite3 agf_database.db < schema.sql
```

### Option 2: MySQL

1. Install MySQL server
2. Run the schema:
```bash
mysql -u root -p < schema-mysql.sql
```

Or connect to MySQL and run:
```sql
SOURCE database/schema-mysql.sql;
```

### Option 3: PostgreSQL

1. Install PostgreSQL server
2. Create database:
```bash
createdb agf_database
```
3. Run the schema:
```bash
psql -d agf_database -f schema-postgresql.sql
```

## Sample Queries

### Insert a User
```sql
INSERT INTO users (email, password, first_name, last_name, phone_number, role)
VALUES ('user@example.com', 'hashed_password_here', 'John', 'Doe', '+1234567890', 'User');
```

### Insert a Worker
```sql
INSERT INTO workers (email, password, first_name, last_name, phone_number, status)
VALUES ('worker@example.com', 'hashed_password_here', 'Jane', 'Smith', '+1234567891', 'Available');
```

### Find User by Email
```sql
SELECT * FROM users WHERE email = 'user@example.com';
```

### Find Available Workers
```sql
SELECT * FROM workers WHERE status = 'Available';
```

## Security Notes

⚠️ **IMPORTANT**: 
- Always hash passwords before storing (use bcrypt, argon2, or similar)
- Never store plain text passwords
- Use prepared statements to prevent SQL injection
- Consider adding email verification fields
- Add password reset tokens if needed

## Next Steps

1. Choose your database (SQLite for development, MySQL/PostgreSQL for production)
2. Run the appropriate schema file
3. Set up database connection in your Next.js app
4. Implement authentication logic with password hashing
5. Create API routes to interact with the database
