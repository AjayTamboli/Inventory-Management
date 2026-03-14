# Inventory Management Backend

This project now includes a production-ready backend API using Node.js + Express, with persistent SQL-based storage (SQLite).

## Features

- REST API for inventory CRUD operations
- SQL-backed persistence using SQLite
- Validation for all inventory fields
- Search, stock filter, and sorting support via query params
- KPI payload in list response (`totalSkus`, `totalQuantity`, `lowStockCount`, `totalValue`)
- Static serving of frontend dashboard
- Automatic one-time bootstrap migration from legacy JSON files (if SQL tables are empty)

## Tech Stack

- Node.js
- Express
- Helmet
- CORS
- Morgan
- SQLite3

## Run Locally

1. Open terminal in `Inventory Management`
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start server:

   ```bash
   npm start
   ```

4. Open:

   - App: `http://localhost:4000`
   - Health: `http://localhost:4000/api/health`

## API Endpoints

### GET `/api/inventory`

Optional query params:

- `search` (text)
- `stock` (`all` | `low` | `healthy`)
- `sortBy` (`type` | `qty` | `unitCost` | `reorderLevel`)
- `order` (`asc` | `desc`)

Response:

- `data`: inventory list
- `kpis`: global dashboard KPIs

### POST `/api/inventory`

Body:

```json
{
  "type": "Cotton 40s",
  "qty": 120,
  "unitCost": 320,
  "reorderLevel": 40
}
```

### PUT `/api/inventory/:id`

Same body as `POST`.

### DELETE `/api/inventory/:id`

Deletes an item by id.

## Data Storage

Data is persisted in SQLite database:

- `data/inventory.db`

Legacy JSON files in `data/*.json` are used only for first-run bootstrap migration if SQL tables are empty.
