# Fuel Station Role Implementation Guide

This document provides comprehensive information about the Fuel Station role implementation in the service marketplace app.

## Overview

The system now supports four roles:
- **USER**: Regular customers requesting services
- **WORKER**: Service delivery workers  
- **FUEL_STATION**: Fuel station account holders
- **ADMIN**: Platform administrators

## Database Schema

### Key Tables

#### 1. fuel_stations
Main fuel station profile table
```sql
CREATE TABLE fuel_stations (
  id PRIMARY KEY,
  user_id UNIQUE (links to users table),
  station_name,
  email UNIQUE,
  phone_number,
  address,
  latitude REAL,
  longitude REAL,
  cod_enabled BOOLEAN,
  cod_current_balance REAL,
  cod_balance_limit REAL,
  is_verified BOOLEAN,
  is_open BOOLEAN,
  platform_trust_flag BOOLEAN,
  total_earnings REAL,
  pending_payout REAL,
  created_at, updated_at
)
```

#### 2. fuel_station_stock
Tracks petrol/diesel inventory
```sql
CREATE TABLE fuel_station_stock (
  id PRIMARY KEY,
  fuel_station_id,
  fuel_type VARCHAR(50), -- 'petrol' or 'diesel'
  stock_litres REAL,
  last_refilled_at DATETIME,
  updated_at
)
```

#### 3. fuel_station_ledger
Transaction history and earnings ledger
```sql
CREATE TABLE fuel_station_ledger (
  id PRIMARY KEY,
  fuel_station_id,
  settlement_id,
  transaction_type VARCHAR(50), -- 'sale', 'cod_settlement', 'payout', etc.
  amount REAL,
  description TEXT,
  running_balance REAL,
  status VARCHAR(30), -- 'pending', 'completed', 'settled'
  created_at, updated_at
)
```

#### 4. cod_settlements
Tracks Cash on Delivery settlements
```sql
CREATE TABLE cod_settlements (
  id PRIMARY KEY,
  service_request_id,
  fuel_station_id,
  worker_id,
  customer_paid_amount REAL,
  fuel_cost REAL,
  fuel_station_payout REAL,
  platform_fee REAL,
  payment_status VARCHAR(30), -- 'pending', 'collected', 'settled'
  collection_method VARCHAR(50),
  collected_at DATETIME,
  settled_at DATETIME,
  created_at, updated_at
)
```

#### 5. audit_logs
Comprehensive audit trail for all changes
```sql
CREATE TABLE audit_logs (
  id PRIMARY KEY,
  action VARCHAR(100),
  entity_type VARCHAR(50),
  entity_id INTEGER,
  user_id INTEGER,
  user_role VARCHAR(50),
  old_values TEXT (JSON),
  new_values TEXT (JSON),
  description TEXT,
  created_at DATETIME
)
```

## Setup Instructions

### 1. Run Database Migration

```bash
node database/migrate-fuel-stations.js
```

This will create all necessary tables:
- fuel_stations
- fuel_station_stock
- fuel_station_ledger
- cod_settlements
- audit_logs

### 2. Environment Variables

Add to your `.env` file:
```
JWT_SECRET=your-secure-secret-key
TOKEN_EXPIRY=7d
```

## API Endpoints

### Authentication

#### Login (Enhanced)
**POST** `/api/auth/login`

Supports all roles including Fuel_Station
```json
{
  "role": "Fuel_Station",
  "email": "station@example.com",
  "password": "password"
}
```

Response:
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": 1,
    "email": "station@example.com",
    "role": "Fuel_Station",
    "station_name": "ABC Fuel",
    "is_verified": true,
    "cod_enabled": true
  }
}
```

#### Fuel Station Signup
**POST** `/api/auth/fuel-station-signup`

```json
{
  "station_name": "ABC Fuel Station",
  "email": "station@example.com",
  "phone_number": "9876543210",
  "address": "Main Road, City",
  "latitude": 28.7041,
  "longitude": 77.1025,
  "password": "secure-password"
}
```

### Fuel Station Endpoints

#### Get Stock Levels
**GET** `/api/fuel-station/stock?fuel_station_id=1`

#### Update Stock
**PATCH** `/api/fuel-station/stock`

```json
{
  "fuel_station_id": 1,
  "fuel_type": "petrol",
  "stock_litres": 500.5
}
```

#### Decrease Stock (On Order Fulfillment)
**POST** `/api/fuel-station/stock`

```json
{
  "fuel_station_id": 1,
  "fuel_type": "petrol",
  "litres_picked_up": 50
}
```

#### Get Earnings & Transactions
**GET** `/api/fuel-station/earnings?fuel_station_id=1&limit=50&offset=0`

Response includes:
- Total earnings
- Pending payout
- Transaction history
- COD settlements

#### Get COD Settings
**GET** `/api/fuel-station/cod-settings?fuel_station_id=1`

#### Update COD Settings
**PATCH** `/api/fuel-station/cod-settings`

```json
{
  "fuel_station_id": 1,
  "cod_enabled": true,
  "cod_balance_limit": 50000
}
```

### Admin Endpoints

#### List All Fuel Stations
**GET** `/api/admin/fuel-stations?search=name&verified_only=false`

#### Create Fuel Station
**POST** `/api/admin/fuel-stations`

```json
{
  "station_name": "ABC Fuel",
  "email": "station@example.com",
  "phone_number": "9876543210",
  "address": "Main Road",
  "latitude": 28.7041,
  "longitude": 77.1025,
  "password": "password",
  "cod_enabled": true,
  "cod_balance_limit": 50000
}
```

#### Get Station Details
**GET** `/api/admin/fuel-stations/1`

#### Update Station Settings
**PATCH** `/api/admin/fuel-stations/1`

```json
{
  "is_verified": true,
  "cod_enabled": true,
  "cod_balance_limit": 50000,
  "is_open": true,
  "platform_trust_flag": true,
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

#### Get Payouts & Ledger
**GET** `/api/admin/fuel-station-payouts?fuel_station_id=1&status=pending&limit=50&offset=0`

#### Settle Payouts
**POST** `/api/admin/fuel-station-payouts`

```json
{
  "fuel_station_id": 1,
  "ledger_ids": [1, 2, 3]
}
```

## Frontend Routes

### Fuel Station Dashboard
- **Dashboard** - `/fuel-station` (overview & metrics)
- **Stock Management** - `/fuel-station/stock` (manage inventory)
- **Earnings & Payouts** - `/fuel-station/earnings` (transaction history)
- **COD Settings** - `/fuel-station/cod-settings` (manage COD)
- **Transactions** - `/fuel-station/transactions` (detailed history)

### Admin Management
- **Fuel Stations List** - `/admin/fuel-stations` (all stations)
- **Station Details** - `/admin/fuel-stations/{id}` (manage individual station)
- **Payouts** - `/admin/fuel-station-payouts` (settlement management)

## Key Features

### 1. Stock Management
- Real-time stock level tracking
- Automatic stock decrease on order fulfillment
- Stock update history in ledger
- Low stock warnings

### 2. Earnings Tracking
- Total earnings calculation
- Pending payout tracking
- Transaction history with status
- COD settlement tracking

### 3. COD Management
- Enable/disable COD acceptance
- COD balance limit configuration
- Pending COD settlement tracking
- Platform trust verification

### 4. Admin Controls
- Create fuel station accounts with credentials
- Assign pump coordinates (latitude/longitude)
- Verify fuel stations
- Enable/disable COD per station
- View all station metrics
- Settle pending payouts
- Track COD settlements

### 5. Security & Audit
- JWT token-based authentication
- Role-based access control
- Comprehensive audit logging
- Transaction tracking

## Workflow Example

### Creating a Fuel Station Account (Admin)

1. Navigate to `/admin/fuel-stations`
2. Click "Create Fuel Station"
3. Fill in details:
   - Station name, email, phone
   - Address, coordinates
   - Password
   - COD settings
4. Submit form
5. System creates:
   - User account with Fuel_Station role
   - Fuel station profile
   - Stock records for petrol/diesel
   - Initial ledger entry

### Managing Stock (Fuel Station)

1. Login with fuel station credentials
2. Navigate to `/fuel-station/stock`
3. View current stock levels
4. Click "Update Stock" on petrol/diesel card
5. Enter new stock litres
6. Save changes
7. Changes logged in ledger with timestamp

### Processing Order & Stock Decrease

When an order is fulfilled:
1. Order completion endpoint calls `/api/fuel-station/stock` (POST)
2. System decreases stock by ordered amount
3. Ledger entry created automatically
4. Earnings updated
5. COD settlement recorded if applicable

### Settling Payouts (Admin)

1. Navigate to `/admin/fuel-station-payouts`
2. Filter by status: "pending"
3. Select fuel station
4. Choose ledger entries to settle
5. Click "Settle Payouts"
6. System:
   - Updates ledger entries to "settled"
   - Updates fuel station pending_payout
   - Creates audit log entry

## Integration Points

### Service Requests
Stock decreases automatically when `service_requests.status` changes to "Completed":
```javascript
// In service request completion handler
await fetch('/api/fuel-station/stock', {
  method: 'POST',
  body: JSON.stringify({
    fuel_station_id: request.fuel_station_id,
    fuel_type: request.service_type, // 'petrol' or 'diesel'
    litres_picked_up: request.litres
  })
})
```

### Payments & Settlements
When a payment is completed:
1. Settlement calculated (see settlement-calculator.js)
2. Fuel station payout recorded
3. Ledger entry created
4. COD settlement tracked if applicable

### Earnings Calculation
- **Fuel Station Payout** = (Customer Amount - Delivery Fee - Platform Fee) * Margin Percentage
- **Pending Amount** = Sum of unpaid settlements
- **Total Earnings** = Sum of all completed settlements

## Security Considerations

1. **Authentication**: JWT tokens with 7-day expiry
2. **Authorization**: Role-based access control on all endpoints
3. **Audit Trail**: All changes logged with user info
4. **Validation**: Input validation on all forms
5. **Database**: Foreign key constraints for referential integrity
6. **Balance Limits**: COD balance limits prevent excessive exposure

## Troubleshooting

### Stock Update Fails
- Verify fuel_station_id is correct
- Check fuel_type is "petrol" or "diesel"
- Ensure stock_litres is non-negative

### Earnings Not Showing
- Check settlement is created in settlements table
- Verify fuel_station_id matches
- Check transaction_type is "sale" or "cod_settlement"

### COD Settings Not Updating
- Verify platform_trust_flag is set by admin
- Check cod_balance_limit is greater than cod_current_balance
- Ensure COD is enabled

### Login Issues
- Verify email exists in fuel_stations table (via users)
- Check password is correct
- Ensure account is not locked
- Verify is_verified status

## Future Enhancements

1. **Bulk Stock Updates** - Import stock levels from CSV
2. **Automated Payouts** - Schedule regular payout settlements
3. **Advanced Analytics** - Earnings trends, peak hours analysis
4. **Mobile App** - Native iOS/Android apps for fuel stations
5. **Real-time Notifications** - Alerts for low stock, payouts
6. **Multi-location Support** - Chains with multiple stations
7. **Pricing Management** - Dynamic pricing per location
8. **Inventory Forecasting** - AI-based stock predictions

## Support

For issues or questions, contact: support@example.com

---

**Last Updated**: 2024
**Version**: 1.0
