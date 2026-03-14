const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs/promises");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 4000;

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "inventory.db");

const INVENTORY_FILE = path.join(DATA_DIR, "inventory.json");
const PURCHASE_PLANS_FILE = path.join(DATA_DIR, "purchase-plans.json");
const STOCK_MOVEMENTS_FILE = path.join(DATA_DIR, "stock-movements.json");
const WEAVER_PRODUCTIONS_FILE = path.join(DATA_DIR, "weaver-productions.json");
const AUDIT_LOGS_FILE = path.join(DATA_DIR, "audit-logs.json");

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

let db;

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

async function readJsonArray(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function appendAuditLog(action, module, details) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  await dbRun(
    `INSERT INTO audit_logs (id, action, module, details, timestamp)
     VALUES (?, ?, ?, ?, ?)`,
    [id, action, module, details, timestamp]
  );

  await dbRun(
    `DELETE FROM audit_logs
     WHERE id NOT IN (
       SELECT id FROM audit_logs ORDER BY timestamp DESC LIMIT 300
     )`
  );
}

function validateInventoryPayload(payload) {
  const type = String(payload.type || "").trim();
  const qty = parseNumber(payload.qty);
  const unitCost = parseNumber(payload.unitCost);
  const reorderLevel = parseNumber(payload.reorderLevel);

  if (!type) {
    return { message: "Yarn type is required." };
  }
  if (qty === null || qty < 0) {
    return { message: "Quantity must be a valid number greater than or equal to 0." };
  }
  if (unitCost === null || unitCost < 0) {
    return { message: "Unit cost must be a valid number greater than or equal to 0." };
  }
  if (reorderLevel === null || reorderLevel < 0) {
    return { message: "Reorder level must be a valid number greater than or equal to 0." };
  }

  return { value: { type, qty, unitCost, reorderLevel } };
}

function validatePurchasePlanPayload(payload) {
  const type = String(payload.type || "").trim();
  const supplier = String(payload.supplier || "").trim();
  const plannedQty = parseNumber(payload.plannedQty);
  const expectedDate = String(payload.expectedDate || "").trim();

  if (!type) {
    return { message: "Yarn type is required." };
  }
  if (!supplier) {
    return { message: "Supplier name is required." };
  }
  if (plannedQty === null || plannedQty <= 0) {
    return { message: "Planned quantity must be greater than 0." };
  }

  return {
    value: {
      type,
      supplier,
      plannedQty,
      expectedDate,
      status: "Planned",
    },
  };
}

function validateStockMovementPayload(payload) {
  const type = String(payload.type || "").trim();
  const movementType = String(payload.movementType || "").trim().toLowerCase();
  const qty = parseNumber(payload.qty);
  const reference = String(payload.reference || "").trim();

  if (!type) {
    return { message: "Yarn type is required." };
  }
  if (movementType !== "in" && movementType !== "out") {
    return { message: "Movement type must be in or out." };
  }
  if (qty === null || qty <= 0) {
    return { message: "Movement quantity must be greater than 0." };
  }

  return {
    value: {
      type,
      movementType,
      qty,
      reference,
    },
  };
}

function validateWeaverPayload(payload) {
  const weaverName = String(payload.weaverName || "").trim();
  const meters = parseNumber(payload.meters);
  const productionDate = String(payload.productionDate || "").trim();
  const shift = String(payload.shift || "").trim();

  if (!weaverName) {
    return { message: "Weaver name is required." };
  }
  if (meters === null || meters <= 0) {
    return { message: "Production meters must be greater than 0." };
  }

  return {
    value: {
      weaverName,
      meters,
      productionDate,
      shift,
    },
  };
}

function validateYarnInventoryPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  let parsedSource = source;

  if (typeof source.qrData === "string" && source.qrData.trim()) {
    try {
      let qrRaw = source.qrData.trim();
      if (qrRaw.startsWith("```") && qrRaw.endsWith("```")) {
        qrRaw = qrRaw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }

      const once = JSON.parse(qrRaw);
      if (typeof once === "string") {
        parsedSource = JSON.parse(once);
      } else {
        parsedSource = once;
      }
    } catch (_error) {
      return { message: "Invalid QR JSON payload." };
    }
  }

  const container = parsedSource?.yarn && typeof parsedSource.yarn === "object"
    ? parsedSource.yarn
    : parsedSource?.data && typeof parsedSource.data === "object"
      ? parsedSource.data
      : parsedSource;

  const count = String(container?.count ?? "").trim();
  const twist = String(container?.twist ?? "").trim();
  const blend = String(container?.blend ?? "").trim();
  const lotNumber = String(container?.lot_number ?? container?.lotNumber ?? container?.lot ?? "").trim();
  const supplier = String(container?.supplier ?? "").trim();
  const quantity = parseNumber(source.quantity ?? container?.quantity);

  if (!count) {
    return { message: "Yarn count is required." };
  }
  if (!twist) {
    return { message: "Yarn twist is required." };
  }
  if (!blend) {
    return { message: "Yarn blend is required." };
  }
  if (!lotNumber) {
    return { message: "Lot number is required." };
  }
  if (!supplier) {
    return { message: "Supplier is required." };
  }
  if (quantity === null || quantity <= 0) {
    return { message: "Quantity must be greater than 0." };
  }

  return {
    value: {
      count,
      twist,
      blend,
      lot_number: lotNumber,
      supplier,
      quantity,
    },
  };
}

function validateYarnSummarySettingsPayload(payload) {
  const type = String(payload.type || "").trim();
  const unitCost = parseNumber(payload.unitCost);
  const reorderLevel = parseNumber(payload.reorderLevel);

  if (!type) {
    return { message: "Yarn type is required." };
  }
  if (unitCost === null || unitCost < 0) {
    return { message: "Unit cost must be a valid number greater than or equal to 0." };
  }
  if (reorderLevel === null || reorderLevel < 0) {
    return { message: "Reorder level must be a valid number greater than or equal to 0." };
  }

  return {
    value: {
      type,
      unitCost,
      reorderLevel,
    },
  };
}

async function findMatchingYarnPackage(payload) {
  return dbGet(
    `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
     FROM yarn_packages
     WHERE LOWER(TRIM(count)) = LOWER(TRIM(?))
       AND LOWER(TRIM(twist)) = LOWER(TRIM(?))
       AND LOWER(TRIM(blend)) = LOWER(TRIM(?))
       AND LOWER(TRIM(lot_number)) = LOWER(TRIM(?))
       AND LOWER(TRIM(supplier)) = LOWER(TRIM(?))
     ORDER BY id DESC
     LIMIT 1`,
    [
      payload.count,
      payload.twist,
      payload.blend,
      payload.lot_number,
      payload.supplier,
    ]
  );
}

function buildInventoryQuery(query) {
  const where = [];
  const params = [];

  const search = String(query.search || "").trim().toLowerCase();
  const stock = String(query.stock || "all");
  const minQty = parseNumber(query.minQty);
  const maxQty = parseNumber(query.maxQty);

  if (search) {
    where.push("LOWER(type) LIKE ?");
    params.push(`%${search}%`);
  }

  if (stock === "low") {
    where.push("qty < reorderLevel");
  }

  if (stock === "healthy") {
    where.push("qty >= reorderLevel");
  }

  if (minQty !== null) {
    where.push("qty >= ?");
    params.push(minQty);
  }

  if (maxQty !== null) {
    where.push("qty <= ?");
    params.push(maxQty);
  }

  const sortMap = {
    type: "type",
    qty: "qty",
    unitCost: "unitCost",
    reorderLevel: "reorderLevel",
  };

  const sortBy = sortMap[String(query.sortBy || "type")] || "type";
  const order = String(query.order || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return {
    sql: `SELECT * FROM inventory ${whereClause} ORDER BY ${sortBy} ${order}`,
    params,
  };
}

async function buildKpis() {
  const row = await dbGet(
    `SELECT
      COUNT(*) AS totalSkus,
      COALESCE(SUM(qty), 0) AS totalQuantity,
      SUM(CASE WHEN qty < reorderLevel THEN 1 ELSE 0 END) AS lowStockCount,
      COALESCE(SUM(qty * unitCost), 0) AS totalValue
     FROM inventory`
  );

  return {
    totalSkus: Number(row?.totalSkus || 0),
    totalQuantity: Number(row?.totalQuantity || 0),
    lowStockCount: Number(row?.lowStockCount || 0),
    totalValue: Number(row?.totalValue || 0),
  };
}

async function ensureTables() {
  await dbRun(`CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    qty REAL NOT NULL,
    unitCost REAL NOT NULL,
    reorderLevel REAL NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS purchase_plans (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    supplier TEXT NOT NULL,
    plannedQty REAL NOT NULL,
    expectedDate TEXT,
    status TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    movementType TEXT NOT NULL,
    qty REAL NOT NULL,
    reference TEXT,
    resultingQty REAL NOT NULL,
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS weaver_productions (
    id TEXT PRIMARY KEY,
    weaverName TEXT NOT NULL,
    meters REAL NOT NULL,
    productionDate TEXT,
    shift TEXT,
    createdAt TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    details TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS yarn_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    count TEXT NOT NULL,
    twist TEXT NOT NULL,
    blend TEXT NOT NULL,
    lot_number TEXT NOT NULL,
    supplier TEXT NOT NULL,
    quantity REAL NOT NULL,
    date_added TEXT NOT NULL,
    is_added_to_summary INTEGER NOT NULL DEFAULT 0
  )`);

  await dbRun(`CREATE TABLE IF NOT EXISTS yarn_summary_settings (
    type TEXT PRIMARY KEY,
    unitCost REAL NOT NULL DEFAULT 0,
    reorderLevel REAL NOT NULL DEFAULT 0,
    updatedAt TEXT NOT NULL
  )`);
}

async function ensureYarnPackagesColumns() {
  const columns = await dbAll(`PRAGMA table_info(yarn_packages)`);
  const hasSummaryFlag = columns.some((column) => column.name === "is_added_to_summary");

  if (!hasSummaryFlag) {
    await dbRun(
      `ALTER TABLE yarn_packages
       ADD COLUMN is_added_to_summary INTEGER NOT NULL DEFAULT 0`
    );
  }
}

async function migrateLegacyYarnInventoryTable() {
  const legacyTable = await dbGet(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'yarn_inventory'`
  );

  if (!legacyTable) {
    return;
  }

  const targetCount = await dbGet(`SELECT COUNT(*) AS count FROM yarn_packages`);
  if (Number(targetCount?.count || 0) > 0) {
    return;
  }

  await dbRun(
    `INSERT INTO yarn_packages (count, twist, blend, lot_number, supplier, quantity, date_added)
     SELECT count, twist, blend, lot_number, supplier, quantity, date_added
     FROM yarn_inventory`
  );
}

async function bootstrapTableFromJson(tableName, filePath, mapper) {
  const countRow = await dbGet(`SELECT COUNT(*) AS count FROM ${tableName}`);
  if (Number(countRow?.count || 0) > 0) {
    return;
  }

  const rows = await readJsonArray(filePath);
  if (!rows.length) {
    return;
  }

  for (const row of rows) {
    await mapper(row);
  }
}

async function bootstrapMigrationFromJson() {
  await bootstrapTableFromJson("inventory", INVENTORY_FILE, async (row) => {
    await dbRun(
      `INSERT INTO inventory (id, type, qty, unitCost, reorderLevel, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        String(row.type || ""),
        Number(row.qty || 0),
        Number(row.unitCost || 0),
        Number(row.reorderLevel || 0),
        row.createdAt || new Date().toISOString(),
        row.updatedAt || new Date().toISOString(),
      ]
    );
  });

  await bootstrapTableFromJson("purchase_plans", PURCHASE_PLANS_FILE, async (row) => {
    await dbRun(
      `INSERT INTO purchase_plans (id, type, supplier, plannedQty, expectedDate, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        String(row.type || ""),
        String(row.supplier || ""),
        Number(row.plannedQty || 0),
        row.expectedDate || "",
        row.status || "Planned",
        row.createdAt || new Date().toISOString(),
        row.updatedAt || new Date().toISOString(),
      ]
    );
  });

  await bootstrapTableFromJson("stock_movements", STOCK_MOVEMENTS_FILE, async (row) => {
    await dbRun(
      `INSERT INTO stock_movements (id, type, movementType, qty, reference, resultingQty, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        String(row.type || ""),
        String(row.movementType || "in"),
        Number(row.qty || 0),
        String(row.reference || ""),
        Number(row.resultingQty || 0),
        row.createdAt || new Date().toISOString(),
      ]
    );
  });

  await bootstrapTableFromJson("weaver_productions", WEAVER_PRODUCTIONS_FILE, async (row) => {
    await dbRun(
      `INSERT INTO weaver_productions (id, weaverName, meters, productionDate, shift, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        String(row.weaverName || ""),
        Number(row.meters || 0),
        String(row.productionDate || ""),
        String(row.shift || ""),
        row.createdAt || new Date().toISOString(),
      ]
    );
  });

  await bootstrapTableFromJson("audit_logs", AUDIT_LOGS_FILE, async (row) => {
    await dbRun(
      `INSERT INTO audit_logs (id, action, module, details, timestamp)
       VALUES (?, ?, ?, ?, ?)`,
      [
        row.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        String(row.action || "CREATE"),
        String(row.module || "System"),
        String(row.details || "Migrated from JSON"),
        row.timestamp || new Date().toISOString(),
      ]
    );
  });
}

async function initializeDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(DB_PATH, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(instance);
    });
  });

  await ensureTables();
  await ensureYarnPackagesColumns();
  await migrateLegacyYarnInventoryTable();
  await bootstrapMigrationFromJson();
}

async function getYarnInventorySummaryRows() {
  return dbAll(
    `WITH package_totals AS (
      SELECT
        TRIM(count || ' ' || blend || ' ' || twist) AS type,
        ROUND(SUM(quantity), 2) AS qty,
        MIN(date_added) AS first_added_at
      FROM yarn_packages
      WHERE is_added_to_summary = 1
      GROUP BY LOWER(TRIM(count || ' ' || blend || ' ' || twist))
    )
    SELECT
      package_totals.type,
      package_totals.qty,
      package_totals.first_added_at,
      COALESCE(summarySettings.unitCost, inventory.unitCost, 0) AS unitCost,
      COALESCE(summarySettings.reorderLevel, inventory.reorderLevel, 0) AS reorderLevel
    FROM package_totals
    LEFT JOIN yarn_summary_settings AS summarySettings
      ON LOWER(summarySettings.type) = LOWER(package_totals.type)
    LEFT JOIN inventory
      ON LOWER(inventory.type) = LOWER(package_totals.type)
    ORDER BY datetime(package_totals.first_added_at) ASC, package_totals.type ASC`
  );
}

function buildSummaryKpis(summaryRows) {
  const totalSkus = summaryRows.length;
  const totalQuantity = summaryRows.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const totalValue = summaryRows.reduce((sum, item) => {
    const qty = Number(item.qty || 0);
    const unitCost = Number(item.unitCost || 0);
    return sum + (qty * unitCost);
  }, 0);
  const lowStockCount = summaryRows.reduce((count, item) => {
    const qty = Number(item.qty || 0);
    const reorderLevel = Number(item.reorderLevel || 0);
    return qty < reorderLevel ? count + 1 : count;
  }, 0);

  return {
    totalSkus,
    totalQuantity: Number(totalQuantity.toFixed(2)),
    lowStockCount,
    totalValue: Number(totalValue.toFixed(2)),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "inventory-api",
    storage: "sqlite",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/inventory", async (req, res, next) => {
  try {
    const query = buildInventoryQuery(req.query);
    const data = await dbAll(query.sql, query.params);
    const kpis = await buildKpis();
    res.json({ data, kpis });
  } catch (error) {
    next(error);
  }
});

app.post("/api/inventory", async (req, res, next) => {
  try {
    const validation = validateInventoryPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const value = validation.value;

    await dbRun(
      `INSERT INTO inventory (id, type, qty, unitCost, reorderLevel, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, value.type, value.qty, value.unitCost, value.reorderLevel, now, now]
    );

    const created = await dbGet(`SELECT * FROM inventory WHERE id = ?`, [id]);
    await appendAuditLog("CREATE", "Inventory", `Added ${created.type} (${created.qty} kg)`);

    res.status(201).json({ data: created, message: "Inventory item created." });
  } catch (error) {
    next(error);
  }
});

app.put("/api/inventory/:id", async (req, res, next) => {
  try {
    const validation = validateInventoryPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const existing = await dbGet(`SELECT * FROM inventory WHERE id = ?`, [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: "Inventory item not found." });
    }

    const value = validation.value;
    const now = new Date().toISOString();

    await dbRun(
      `UPDATE inventory
       SET type = ?, qty = ?, unitCost = ?, reorderLevel = ?, updatedAt = ?
       WHERE id = ?`,
      [value.type, value.qty, value.unitCost, value.reorderLevel, now, req.params.id]
    );

    const updated = await dbGet(`SELECT * FROM inventory WHERE id = ?`, [req.params.id]);
    await appendAuditLog("UPDATE", "Inventory", `Updated ${updated.type} (${updated.qty} kg)`);

    res.json({ data: updated, message: "Inventory item updated." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/inventory/:id", async (req, res, next) => {
  try {
    const existing = await dbGet(`SELECT * FROM inventory WHERE id = ?`, [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: "Inventory item not found." });
    }

    await dbRun(`DELETE FROM inventory WHERE id = ?`, [req.params.id]);
    await appendAuditLog("DELETE", "Inventory", `Deleted ${existing.type}`);

    res.json({ message: "Inventory item deleted." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/purchase-plans", async (req, res, next) => {
  try {
    const status = String(req.query.status || "all").toLowerCase();
    const data = status === "all"
      ? await dbAll(`SELECT * FROM purchase_plans ORDER BY datetime(createdAt) DESC`)
      : await dbAll(
        `SELECT * FROM purchase_plans WHERE LOWER(status) = ? ORDER BY datetime(createdAt) DESC`,
        [status]
      );

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/purchase-plans", async (req, res, next) => {
  try {
    const validation = validatePurchasePlanPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const value = validation.value;

    await dbRun(
      `INSERT INTO purchase_plans (id, type, supplier, plannedQty, expectedDate, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, value.type, value.supplier, value.plannedQty, value.expectedDate, value.status, now, now]
    );

    const plan = await dbGet(`SELECT * FROM purchase_plans WHERE id = ?`, [id]);
    await appendAuditLog("CREATE", "Purchase Planning", `Plan created for ${plan.type} (${plan.plannedQty} kg)`);

    res.status(201).json({ data: plan, message: "Purchase plan created." });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/purchase-plans/:id/status", async (req, res, next) => {
  try {
    const status = String(req.body.status || "").trim();
    const allowed = ["Planned", "Ordered", "Received", "Cancelled"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const existing = await dbGet(`SELECT * FROM purchase_plans WHERE id = ?`, [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: "Purchase plan not found." });
    }

    const now = new Date().toISOString();
    await dbRun(
      `UPDATE purchase_plans SET status = ?, updatedAt = ? WHERE id = ?`,
      [status, now, req.params.id]
    );

    const updated = await dbGet(`SELECT * FROM purchase_plans WHERE id = ?`, [req.params.id]);
    await appendAuditLog("UPDATE", "Purchase Planning", `Plan status changed to ${status} for ${updated.type}`);

    res.json({ data: updated, message: "Purchase plan status updated." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/purchase-plans/:id", async (req, res, next) => {
  try {
    const existing = await dbGet(`SELECT * FROM purchase_plans WHERE id = ?`, [req.params.id]);
    if (!existing) {
      return res.status(404).json({ message: "Purchase plan not found." });
    }

    await dbRun(`DELETE FROM purchase_plans WHERE id = ?`, [req.params.id]);
    await appendAuditLog("DELETE", "Purchase Planning", `Deleted plan for ${existing.type}`);

    res.json({ message: "Purchase plan deleted." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stock-movements", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 50);
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const data = await dbAll(
      `SELECT * FROM stock_movements ORDER BY datetime(createdAt) DESC LIMIT ?`,
      [safeLimit]
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/stock-movements", async (req, res, next) => {
  try {
    const validation = validateStockMovementPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const payload = validation.value;
    const target = await dbGet(
      `SELECT * FROM inventory WHERE LOWER(type) = LOWER(?) LIMIT 1`,
      [payload.type]
    );

    if (!target) {
      return res.status(404).json({ message: "Yarn type not found in inventory." });
    }

    const nextQty = payload.movementType === "in"
      ? Number(target.qty) + payload.qty
      : Number(target.qty) - payload.qty;

    if (nextQty < 0) {
      return res.status(400).json({ message: "Insufficient stock for stock-out movement." });
    }

    const movementId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    await dbRun("BEGIN TRANSACTION");
    try {
      await dbRun(
        `UPDATE inventory SET qty = ?, updatedAt = ? WHERE id = ?`,
        [nextQty, now, target.id]
      );

      await dbRun(
        `INSERT INTO stock_movements (id, type, movementType, qty, reference, resultingQty, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          movementId,
          target.type,
          payload.movementType,
          payload.qty,
          payload.reference,
          nextQty,
          now,
        ]
      );

      await dbRun("COMMIT");
    } catch (error) {
      await dbRun("ROLLBACK");
      throw error;
    }

    await appendAuditLog(
      "CREATE",
      "Stock Movement",
      `${payload.movementType.toUpperCase()} ${payload.qty} kg for ${target.type}`
    );

    const movement = await dbGet(`SELECT * FROM stock_movements WHERE id = ?`, [movementId]);
    res.status(201).json({ data: movement, message: "Stock movement recorded." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/weaver-performance", async (_req, res, next) => {
  try {
    const data = await dbAll(
      `SELECT
        weaverName,
        COUNT(*) AS productionCount,
        ROUND(SUM(meters), 2) AS totalMeters,
        MAX(createdAt) AS lastProductionAt,
        ROUND(AVG(meters), 2) AS avgMeters
       FROM weaver_productions
       GROUP BY LOWER(weaverName)
       ORDER BY totalMeters DESC`
    );

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/weaver-performance", async (req, res, next) => {
  try {
    const validation = validateWeaverPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const value = validation.value;

    await dbRun(
      `INSERT INTO weaver_productions (id, weaverName, meters, productionDate, shift, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, value.weaverName, value.meters, value.productionDate, value.shift, now]
    );

    await appendAuditLog("CREATE", "Weaver Performance", `Logged ${value.meters} meters for ${value.weaverName}`);

    const entry = await dbGet(`SELECT * FROM weaver_productions WHERE id = ?`, [id]);
    res.status(201).json({ data: entry, message: "Weaver production added." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit-logs", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 100);
    const safeLimit = Math.max(1, Math.min(limit, 300));
    const data = await dbAll(
      `SELECT * FROM audit_logs ORDER BY datetime(timestamp) DESC LIMIT ?`,
      [safeLimit]
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.get("/api/yarn-inventory", async (_req, res, next) => {
  try {
    const data = await dbAll(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages
       ORDER BY datetime(date_added) DESC, id DESC`
    );

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/yarn-inventory", async (req, res, next) => {
  try {
    const validation = validateYarnInventoryPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const payload = validation.value;
    const existing = await findMatchingYarnPackage(payload);
    if (existing) {
      const mergedQuantity = Number(existing.quantity || 0) + Number(payload.quantity || 0);
      await dbRun(
        `UPDATE yarn_packages
         SET quantity = ?
         WHERE id = ?`,
        [mergedQuantity, existing.id]
      );

      const merged = await dbGet(
        `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
         FROM yarn_packages
         WHERE id = ?`,
        [existing.id]
      );

      await appendAuditLog(
        "UPDATE",
        "Yarn Inventory",
        `Merged quantity for lot ${merged.lot_number}. New quantity ${merged.quantity} kg`
      );

      return res.status(200).json({
        data: merged,
        message: "Existing yarn record found. Quantity added to previous entry.",
        merged: true,
      });
    }

    const dateAdded = new Date().toISOString();

    const result = await dbRun(
      `INSERT INTO yarn_packages (count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        payload.count,
        payload.twist,
        payload.blend,
        payload.lot_number,
        payload.supplier,
        payload.quantity,
        dateAdded,
      ]
    );

    const created = await dbGet(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages
       WHERE id = ?`,
      [result.lastID]
    );

    await appendAuditLog(
      "CREATE",
      "Yarn Inventory",
      `Added lot ${created.lot_number} (${created.quantity} kg)`
    );

    res.status(201).json({ data: created, message: "Yarn inventory item added." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/yarn-packages", async (_req, res, next) => {
  try {
    const data = await dbAll(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages
       ORDER BY datetime(date_added) DESC, id DESC`
    );

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.post("/api/yarn-packages", async (req, res, next) => {
  try {
    const validation = validateYarnInventoryPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const payload = validation.value;
    const existing = await findMatchingYarnPackage(payload);
    if (existing) {
      const mergedQuantity = Number(existing.quantity || 0) + Number(payload.quantity || 0);
      await dbRun(
        `UPDATE yarn_packages
         SET quantity = ?
         WHERE id = ?`,
        [mergedQuantity, existing.id]
      );

      const merged = await dbGet(
        `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
         FROM yarn_packages
         WHERE id = ?`,
        [existing.id]
      );

      await appendAuditLog(
        "UPDATE",
        "Yarn Packages",
        `Merged quantity for lot ${merged.lot_number}. New quantity ${merged.quantity} kg`
      );

      return res.status(200).json({
        data: merged,
        message: "Existing yarn record found. Quantity added to previous entry.",
        merged: true,
      });
    }

    const dateAdded = new Date().toISOString();

    const result = await dbRun(
      `INSERT INTO yarn_packages (count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        payload.count,
        payload.twist,
        payload.blend,
        payload.lot_number,
        payload.supplier,
        payload.quantity,
        dateAdded,
      ]
    );

    const created = await dbGet(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages
       WHERE id = ?`,
      [result.lastID]
    );

    await appendAuditLog(
      "CREATE",
      "Yarn Packages",
      `Added lot ${created.lot_number} (${created.quantity} kg)`
    );

    res.status(201).json({ data: created, message: "Yarn package added." });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/yarn-packages/:id/add-to-summary", async (req, res, next) => {
  try {
    const existing = await dbGet(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages WHERE id = ?`,
      [req.params.id]
    );

    if (!existing) {
      return res.status(404).json({ message: "Yarn package not found." });
    }

    if (Number(existing.is_added_to_summary) === 1) {
      return res.json({ data: existing, message: "Package already added to summary." });
    }

    await dbRun(
      `UPDATE yarn_packages SET is_added_to_summary = 1 WHERE id = ?`,
      [req.params.id]
    );

    const updated = await dbGet(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages WHERE id = ?`,
      [req.params.id]
    );

    await appendAuditLog(
      "UPDATE",
      "Yarn Packages",
      `Added lot ${updated.lot_number} to summary`
    );

    res.json({ data: updated, message: "Yarn package added to summary." });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/yarn-packages/:id", async (req, res, next) => {
  try {
    const existing = await dbGet(
      `SELECT id, count, twist, blend, lot_number, supplier, quantity, date_added, is_added_to_summary
       FROM yarn_packages WHERE id = ?`,
      [req.params.id]
    );

    if (!existing) {
      return res.status(404).json({ message: "Yarn package not found." });
    }

    await dbRun(`DELETE FROM yarn_packages WHERE id = ?`, [req.params.id]);

    await appendAuditLog(
      "DELETE",
      "Yarn Packages",
      `Deleted lot ${existing.lot_number} (${existing.quantity} kg)`
    );

    res.json({ message: "Yarn package deleted.", data: existing });
  } catch (error) {
    next(error);
  }
});

app.get("/api/yarn-inventory-summary", async (_req, res, next) => {
  try {
    const data = await getYarnInventorySummaryRows();
    const kpis = buildSummaryKpis(data);
    res.json({ data, kpis });
  } catch (error) {
    next(error);
  }
});

app.get("/api/yarn-summary-settings", async (_req, res, next) => {
  try {
    const data = await dbAll(
      `SELECT type, unitCost, reorderLevel, updatedAt
       FROM yarn_summary_settings
       ORDER BY LOWER(type) ASC`
    );
    res.json({ data });
  } catch (error) {
    next(error);
  }
});

app.put("/api/yarn-summary-settings", async (req, res, next) => {
  try {
    const validation = validateYarnSummarySettingsPayload(req.body);
    if (!validation.value) {
      return res.status(400).json({ message: validation.message });
    }

    const payload = validation.value;
    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO yarn_summary_settings (type, unitCost, reorderLevel, updatedAt)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(type) DO UPDATE SET
         unitCost = excluded.unitCost,
         reorderLevel = excluded.reorderLevel,
         updatedAt = excluded.updatedAt`,
      [payload.type, payload.unitCost, payload.reorderLevel, now]
    );

    const updated = await dbGet(
      `SELECT type, unitCost, reorderLevel, updatedAt
       FROM yarn_summary_settings
       WHERE LOWER(type) = LOWER(?)
       LIMIT 1`,
      [payload.type]
    );

    await appendAuditLog(
      "UPDATE",
      "Yarn Summary",
      `Updated settings for ${updated.type} (cost ${updated.unitCost}, reorder ${updated.reorderLevel})`
    );

    res.json({ data: updated, message: "Yarn summary settings saved." });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/yarn-summary/remove-from-summary", async (req, res, next) => {
  try {
    const type = String(req.body.type || "").trim();
    if (!type) {
      return res.status(400).json({ message: "Yarn type is required." });
    }

    const affectedRow = await dbGet(
      `SELECT COUNT(*) AS count
       FROM yarn_packages
       WHERE LOWER(TRIM(count || ' ' || blend || ' ' || twist)) = LOWER(?)
         AND is_added_to_summary = 1`,
      [type]
    );

    const affectedCount = Number(affectedRow?.count || 0);
    if (affectedCount === 0) {
      return res.status(404).json({ message: "No summary entries found for this yarn type." });
    }

    await dbRun(
      `UPDATE yarn_packages
       SET is_added_to_summary = 0
       WHERE LOWER(TRIM(count || ' ' || blend || ' ' || twist)) = LOWER(?)
         AND is_added_to_summary = 1`,
      [type]
    );

    await appendAuditLog(
      "UPDATE",
      "Yarn Summary",
      `Removed ${affectedCount} entries from summary for ${type}`
    );

    res.json({ message: "Entries removed from summary.", affectedCount });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(__dirname));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "Index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Internal server error." });
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Inventory backend running on http://localhost:${PORT}`);
      console.log(`SQL database: ${DB_PATH}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize SQL database:", error);
    process.exit(1);
  });
