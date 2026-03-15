const inventoryForm = document.getElementById("inventoryForm");
const yarnTypeInput = document.getElementById("yarnType");
const yarnQtyInput = document.getElementById("yarnQty");
const unitCostInput = document.getElementById("unitCost");
const reorderLevelInput = document.getElementById("reorderLevel");
const submitButton = document.getElementById("submitButton");
const resetButton = document.getElementById("resetButton");
const formError = document.getElementById("formError");

const yarnQrForm = document.getElementById("yarnQrForm");
const qrCountInput = document.getElementById("qrCount");
const qrTwistInput = document.getElementById("qrTwist");
const qrBlendInput = document.getElementById("qrBlend");
const qrLotNumberInput = document.getElementById("qrLotNumber");
const qrSupplierInput = document.getElementById("qrSupplier");
const qrQuantityInput = document.getElementById("qrQuantity");
const yarnQrError = document.getElementById("yarnQrError");
const yarnQrTableBody = document.querySelector("#yarnQrTable tbody");
const yarnQrEmptyState = document.getElementById("yarnQrEmptyState");
const startQrScannerBtn = document.getElementById("startQrScannerBtn");
const stopQrScannerBtn = document.getElementById("stopQrScannerBtn");
const qrStatus = document.getElementById("qrStatus");

const inventoryTableBody = document.querySelector("#inventoryTable tbody");
const searchInput = document.getElementById("searchInput");
const stockFilter = document.getElementById("stockFilter");
const minQtyFilter = document.getElementById("minQtyFilter");
const maxQtyFilter = document.getElementById("maxQtyFilter");
const resetFiltersBtn = document.getElementById("resetFiltersBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const sortButtons = document.querySelectorAll(".sort-btn");
const emptyState = document.getElementById("emptyState");
const productionGraph = document.getElementById("productionGraph");
const productionGraphEmpty = document.getElementById("productionGraphEmpty");
const batchProgressList = document.getElementById("batchProgressList");
const batchProgressEmpty = document.getElementById("batchProgressEmpty");
const yarnInventoryPieChart = document.getElementById("yarnInventoryPieChart");
const yarnInventoryPieLegend = document.getElementById("yarnInventoryPieLegend");
const yarnInventoryPieEmpty = document.getElementById("yarnInventoryPieEmpty");

const purchaseForm = document.getElementById("purchaseForm");
const purchaseTableBody = document.querySelector("#purchaseTable tbody");
const purchaseError = document.getElementById("purchaseError");
const purchaseEmptyState = document.getElementById("purchaseEmptyState");

const movementForm = document.getElementById("movementForm");
const movementTableBody = document.querySelector("#movementTable tbody");
const movementError = document.getElementById("movementError");
const movementEmptyState = document.getElementById("movementEmptyState");

const weaverForm = document.getElementById("weaverForm");
const weaverTableBody = document.querySelector("#weaverTable tbody");
const weaverError = document.getElementById("weaverError");
const weaverEmptyState = document.getElementById("weaverEmptyState");

const auditTableBody = document.querySelector("#auditTable tbody");
const auditEmptyState = document.getElementById("auditEmptyState");
const recentActivityTableBody = document.getElementById("recentActivityTableBody");
const recentActivityEmptyState = document.getElementById("recentActivityEmptyState");

const totalSkus = document.getElementById("totalSkus");
const totalQuantity = document.getElementById("totalQuantity");
const lowStockCount = document.getElementById("lowStockCount");
const totalValue = document.getElementById("totalValue");
const totalSuppliers = document.getElementById("totalSuppliers");
const lastUpdated = document.getElementById("lastUpdated");
const refreshAllBtn = document.getElementById("refreshAllBtn");
const toastContainer = document.getElementById("toastContainer");
const summaryCards = document.getElementById("summaryCards");
const flowButtons = document.querySelectorAll(".flow-step");
const logoutFlowBtn = document.getElementById("logoutFlowBtn");

const loginFlowOverlay = document.getElementById("loginFlowOverlay");
const loginFlowForm = document.getElementById("loginFlowForm");
const loginFlowEmail = document.getElementById("loginFlowEmail");
const loginFlowPassword = document.getElementById("loginFlowPassword");
const loginFlowError = document.getElementById("loginFlowError");

const sidebarItems = document.querySelectorAll(".sidebar li[data-section]");
const sections = document.querySelectorAll(".module-section");

let inventory = [];
let purchasePlans = [];
let movements = [];
let weaverPerformance = [];
let auditLogs = [];
let yarnQrInventory = [];
let inventoryForChart = [];
let editingId = null;
let sortState = { key: "firstAddedAt", direction: "asc" };
let searchDebounce;
let qrScanner = null;
let qrScannerActive = false;
let lastScannedText = "";
const AUTH_FLOW_KEY = "im-workflow-auth";

function formatCurrency(value) {
	return new Intl.NumberFormat("en-IN", {
		style: "currency",
		currency: "INR",
		maximumFractionDigits: 2,
	}).format(Number(value || 0));
}

function formatDateTime(value) {
	if (!value) {
		return "-";
	}
	return new Date(value).toLocaleString();
}

function formatDate(value) {
	if (!value) {
		return "-";
	}
	return new Date(value).toLocaleDateString();
}

function setFormError(target, message) {
	target.textContent = message;
}

function clearFormError(target) {
	target.textContent = "";
}

function setFlowAuth(isAuthenticated) {
	if (isAuthenticated) {
		localStorage.setItem(AUTH_FLOW_KEY, "1");
		return;
	}
	localStorage.removeItem(AUTH_FLOW_KEY);
}

function isFlowAuthenticated() {
	return localStorage.getItem(AUTH_FLOW_KEY) === "1";
}

function updateAuthGateUI() {
	const authenticated = isFlowAuthenticated();
	if (authenticated) {
		document.body.classList.remove("requires-login");
		loginFlowOverlay.classList.remove("open");
		loginFlowOverlay.setAttribute("aria-hidden", "true");
		return;
	}
	document.body.classList.add("requires-login");
	loginFlowOverlay.classList.add("open");
	loginFlowOverlay.setAttribute("aria-hidden", "false");
	window.setTimeout(() => loginFlowEmail.focus(), 40);
}

function showToast(message, tone = "info") {
	if (!toastContainer) {
		return;
	}
	const toast = document.createElement("div");
	toast.className = `toast ${tone}`;
	toast.textContent = message;
	toastContainer.appendChild(toast);
	window.setTimeout(() => {
		toast.classList.add("fade-out");
		window.setTimeout(() => toast.remove(), 280);
	}, 2600);
}

function updateLastUpdated() {
	lastUpdated.textContent = new Date().toLocaleString();
}

function isLowStock(item) {
	return Number(item.qty || 0) < Number(item.reorderLevel || 0);
}

function validateInventory(type, qty, unitCost, reorderLevel) {
	if (!type.trim()) {
		return "Yarn type is required.";
	}
	if (!Number.isFinite(qty) || qty < 0) {
		return "Quantity must be a valid number greater than or equal to 0.";
	}
	if (!Number.isFinite(unitCost) || unitCost < 0) {
		return "Unit cost must be a valid number greater than or equal to 0.";
	}
	if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
		return "Reorder level must be a valid number greater than or equal to 0.";
	}
	return "";
}

function validatePurchase(type, plannedQty, supplier) {
	if (!type.trim()) {
		return "Yarn type is required.";
	}
	if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
		return "Planned quantity must be greater than 0.";
	}
	if (!supplier.trim()) {
		return "Supplier name is required.";
	}
	return "";
}

function validateMovement(type, qty) {
	if (!type.trim()) {
		return "Yarn type is required.";
	}
	if (!Number.isFinite(qty) || qty <= 0) {
		return "Movement quantity must be greater than 0.";
	}
	return "";
}

function validateWeaver(weaverName, meters) {
	if (!weaverName.trim()) {
		return "Weaver name is required.";
	}
	if (!Number.isFinite(meters) || meters <= 0) {
		return "Production meters must be greater than 0.";
	}
	return "";
}

function validateYarnQrPayload(payload) {
	if (!payload.count) {
		return "Count is required.";
	}
	if (!payload.twist) {
		return "Twist is required.";
	}
	if (!payload.blend) {
		return "Blend is required.";
	}
	if (!payload.lot_number) {
		return "Lot number is required.";
	}
	if (!payload.supplier) {
		return "Supplier is required.";
	}
	if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
		return "Quantity must be greater than 0.";
	}
	return "";
}

function resetInventoryForm() {
	editingId = null;
	submitButton.textContent = "Add Stock";
	inventoryForm.reset();
	clearFormError(formError);
	yarnTypeInput.focus();
}

async function apiRequest(path, options = {}) {
	const response = await fetch(path, {
		headers: {
			"Content-Type": "application/json",
			...(options.headers || {}),
		},
		...options,
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(payload.message || "Request failed.");
		error.status = response.status;
		throw error;
	}
	return payload;
}

function escapeCsv(value) {
	const raw = String(value ?? "");
	if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
		return `"${raw.replace(/"/g, '""')}"`;
	}
	return raw;
}

function downloadFile(filename, content, mimeType) {
	const blob = new Blob([content], { type: mimeType });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(link.href);
}

function exportInventoryCsv() {
	if (!inventory.length) {
		setFormError(formError, "No filtered inventory data available for CSV export.");
		showToast("No data available for CSV export.", "warning");
		return;
	}

	const headers = ["Yarn Type", "Entries", "Quantity (kg)", "Unit Cost", "Reorder Level", "Status", "Inventory Value"];
	const rows = inventory.map((item) => [
		item.type,
		item.entryCount || 0,
		item.qty,
		item.unitCost,
		item.reorderLevel,
		isLowStock(item) ? "Low Stock" : "Healthy",
		(item.qty * item.unitCost).toFixed(2),
	]);

	const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
	const stamp = new Date().toISOString().slice(0, 10);
	downloadFile(`inventory-report-${stamp}.csv`, csv, "text/csv;charset=utf-8");
	clearFormError(formError);
	showToast("CSV export downloaded.", "success");
}

function exportDashboardReport() {
	if (!window.jspdf || !window.jspdf.jsPDF) {
		setFormError(formError, "PDF export library failed to load.");
		showToast("PDF export unavailable right now.", "error");
		return;
	}
	const { jsPDF } = window.jspdf;
	const doc = new jsPDF({ unit: "pt", format: "a4" });
	const stamp = new Date().toISOString().slice(0, 10);
	let y = 42;
	const x = 40;
	const lineGap = 18;
	const writeLine = (text, size = 11, weight = "normal") => {
		doc.setFont("helvetica", weight);
		doc.setFontSize(size);
		doc.text(String(text), x, y);
		y += lineGap;
		if (y > 790) {
			doc.addPage();
			y = 42;
		}
	};
	writeLine("TextileOps Dashboard Report", 18, "bold");
	writeLine(`Generated: ${new Date().toLocaleString()}`, 10, "normal");
	y += 8;
	if (!inventory.length) {
		writeLine("No summary rows.");
	} else {
		inventory.slice(0, 12).forEach((item, index) => {
			writeLine(`${index + 1}. ${item.type} | Entries: ${item.entryCount || 0} | Qty: ${item.qty} kg | Cost: ${item.unitCost}`);
		});
	}
	doc.save(`dashboard-report-${stamp}.pdf`);
	showToast("PDF report exported.", "success");
}

function resetInventoryFilters() {
	searchInput.value = "";
	stockFilter.value = "all";
	minQtyFilter.value = "";
	maxQtyFilter.value = "";
	loadInventoryFromApi().catch(() => setFormError(formError, "Unable to reset filters right now."));
}

function createActionButton(label, className, onClick) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = className;
	button.textContent = label;
	button.addEventListener("click", onClick);
	return button;
}

function renderInventoryTable() {
	inventoryTableBody.innerHTML = "";
	inventory.forEach((item) => {
		const row = inventoryTableBody.insertRow();
		const sequence = inventoryTableBody.rows.length;
		const qty = Number(item.qty || 0);
		const unitCost = Number(item.unitCost || 0);
		const reorderLevel = Number(item.reorderLevel || 0);
		const value = qty * unitCost;
		const lowStock = isLowStock(item);

		row.insertCell(0).textContent = String(sequence);
		row.insertCell(1).textContent = item.type;
		row.insertCell(2).textContent = String(item.entryCount || 0);
		row.insertCell(3).textContent = `${qty} kg`;
		row.insertCell(4).textContent = `${formatCurrency(unitCost)} /kg`;
		row.insertCell(5).textContent = formatCurrency(value);
		row.insertCell(6).textContent = `${reorderLevel} kg`;

		const statusCell = row.insertCell(7);
		const statusBadge = document.createElement("span");
		statusBadge.className = lowStock ? "status-badge low" : "status-badge healthy";
		statusBadge.textContent = lowStock ? "Low Stock" : "Healthy";
		statusCell.appendChild(statusBadge);

		const settingsCell = row.insertCell(8);
		const settingsWrap = document.createElement("div");
		settingsWrap.className = "summary-actions";

		const unitCostField = document.createElement("input");
		unitCostField.type = "number";
		unitCostField.min = "0";
		unitCostField.step = "0.01";
		unitCostField.className = "table-input";
		unitCostField.value = String(unitCost);

		const reorderField = document.createElement("input");
		reorderField.type = "number";
		reorderField.min = "0";
		reorderField.step = "1";
		reorderField.className = "table-input";
		reorderField.value = String(reorderLevel);

		const saveButton = createActionButton("Save", "table-btn edit", async () => {
			const nextUnitCost = Number(unitCostField.value);
			const nextReorderLevel = Number(reorderField.value);
			if (!Number.isFinite(nextUnitCost) || nextUnitCost < 0) {
				setFormError(formError, "Unit cost must be a valid number greater than or equal to 0.");
				return;
			}
			if (!Number.isFinite(nextReorderLevel) || nextReorderLevel < 0) {
				setFormError(formError, "Reorder level must be a valid number greater than or equal to 0.");
				return;
			}
			try {
				await apiRequest("/api/yarn-summary-settings", {
					method: "PUT",
					body: JSON.stringify({ type: item.type, unitCost: nextUnitCost, reorderLevel: nextReorderLevel }),
				});
				await refreshAllData();
				showToast(`Summary settings saved for ${item.type}.`, "success");
			} catch (error) {
				setFormError(formError, error.message || "Failed to save summary settings.");
			}
		});

		const removeButton = createActionButton("Remove", "table-btn delete", async () => {
			try {
				await apiRequest("/api/yarn-summary/remove-from-summary", {
					method: "PATCH",
					body: JSON.stringify({ type: item.type }),
				});
				await refreshAllData();
				showToast(`Removed summary entries for ${item.type}.`, "warning");
			} catch (error) {
				setFormError(formError, error.message || "Failed to remove summary entries.");
				showToast("Unable to remove summary entries.", "error");
			}
		});

		settingsWrap.appendChild(unitCostField);
		settingsWrap.appendChild(reorderField);
		settingsWrap.appendChild(saveButton);
		settingsWrap.appendChild(removeButton);
		settingsCell.appendChild(settingsWrap);
	});
	emptyState.style.display = inventory.length ? "none" : "block";
}

function renderProductionGraph() {
	productionGraph.innerHTML = "";
	if (!weaverPerformance.length) {
		productionGraphEmpty.style.display = "block";
		return;
	}
	productionGraphEmpty.style.display = "none";
	const topWeavers = weaverPerformance.slice(0, 6);
	const maxMeters = topWeavers.reduce((max, item) => Math.max(max, Number(item.totalMeters) || 0), 0) || 1;
	topWeavers.forEach((record) => {
		const row = document.createElement("div");
		row.className = "graph-row";
		const label = document.createElement("span");
		label.className = "graph-label";
		label.textContent = record.weaverName;
		const barTrack = document.createElement("div");
		barTrack.className = "graph-track";
		const barFill = document.createElement("div");
		barFill.className = "graph-fill";
		barFill.style.width = `${Math.max(8, Math.round((record.totalMeters / maxMeters) * 100))}%`;
		const value = document.createElement("span");
		value.className = "graph-value";
		value.textContent = `${record.totalMeters} m`;
		barTrack.appendChild(barFill);
		row.appendChild(label);
		row.appendChild(barTrack);
		row.appendChild(value);
		productionGraph.appendChild(row);
	});
}

function getBatchProgressPercent(status) {
	if (status === "Received") return 100;
	if (status === "Ordered") return 65;
	if (status === "Planned") return 30;
	if (status === "Cancelled") return 0;
	return 20;
}

function renderBatchProgress() {
	batchProgressList.innerHTML = "";
	if (!purchasePlans.length) {
		batchProgressEmpty.style.display = "block";
		return;
	}
	batchProgressEmpty.style.display = "none";
	purchasePlans.slice(0, 6).forEach((plan) => {
		const percent = getBatchProgressPercent(plan.status);
		const row = document.createElement("div");
		row.className = "batch-row";
		const topLine = document.createElement("div");
		topLine.className = "batch-top";
		const title = document.createElement("span");
		title.className = "batch-title";
		title.textContent = `${plan.type} (${plan.plannedQty} kg)`;
		const status = document.createElement("span");
		status.className = "batch-status";
		status.textContent = plan.status;
		topLine.appendChild(title);
		topLine.appendChild(status);
		const progressTrack = document.createElement("div");
		progressTrack.className = "batch-track";
		const progressFill = document.createElement("div");
		progressFill.className = "batch-fill";
		progressFill.style.width = `${percent}%`;
		const percentLabel = document.createElement("span");
		percentLabel.className = "batch-percent";
		percentLabel.textContent = `${percent}%`;
		progressTrack.appendChild(progressFill);
		row.appendChild(topLine);
		row.appendChild(progressTrack);
		row.appendChild(percentLabel);
		batchProgressList.appendChild(row);
	});
}

function renderYarnInventoryPieChart() {
	if (!yarnInventoryPieChart || !yarnInventoryPieLegend || !yarnInventoryPieEmpty) return;
	yarnInventoryPieLegend.innerHTML = "";
	const rows = inventoryForChart
		.filter((item) => Number(item.qty || 0) > 0)
		.sort((first, second) => Number(second.qty || 0) - Number(first.qty || 0))
		.slice(0, 6);

	if (!rows.length) {
		yarnInventoryPieChart.style.background = "none";
		yarnInventoryPieEmpty.style.display = "block";
		return;
	}

	yarnInventoryPieEmpty.style.display = "none";
	const totalQty = rows.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 1;
	const rootStyle = getComputedStyle(document.documentElement);
	const primary = rootStyle.getPropertyValue("--primary").trim() || "#2563eb";
	const accent = rootStyle.getPropertyValue("--accent").trim() || "#06b6d4";
	const palette = [primary, accent, "#1d4ed8", "#0ea5e9", "#16a34a", "#f59e0b"];

	let start = 0;
	const segments = rows.map((item, index) => {
		const fraction = Number(item.qty || 0) / totalQty;
		const sweep = fraction * 360;
		const end = start + sweep;
		const color = palette[index % palette.length];
		const segment = `${color} ${start.toFixed(2)}deg ${end.toFixed(2)}deg`;
		start = end;
		return { item, color, segment, share: fraction * 100 };
	});

	yarnInventoryPieChart.style.background = `conic-gradient(${segments.map((part) => part.segment).join(", ")})`;

	segments.forEach((part) => {
		const legendRow = document.createElement("div");
		legendRow.className = "yarn-pie-legend-row";

		const marker = document.createElement("span");
		marker.className = "yarn-pie-dot";
		marker.style.background = part.color;

		const label = document.createElement("span");
		label.className = "yarn-pie-label";
		label.textContent = part.item.type;

		const value = document.createElement("span");
		value.className = "yarn-pie-value";
		value.textContent = `${Number(part.item.qty || 0)} kg (${part.share.toFixed(1)}%)`;

		legendRow.appendChild(marker);
		legendRow.appendChild(label);
		legendRow.appendChild(value);
		yarnInventoryPieLegend.appendChild(legendRow);
	});
}

function renderPurchaseTable() {
	purchaseTableBody.innerHTML = "";
	purchasePlans.forEach((plan) => {
		const row = purchaseTableBody.insertRow();
		row.insertCell(0).textContent = plan.type;
		row.insertCell(1).textContent = `${plan.plannedQty} kg`;
		row.insertCell(2).textContent = plan.supplier;
		row.insertCell(3).textContent = formatDate(plan.expectedDate);
		const statusCell = row.insertCell(4);
		const statusSelect = document.createElement("select");
		["Planned", "Ordered", "Received", "Cancelled"].forEach((status) => {
			const option = document.createElement("option");
			option.value = status;
			option.textContent = status;
			if (plan.status === status) option.selected = true;
			statusSelect.appendChild(option);
		});
		statusSelect.addEventListener("change", async () => {
			try {
				await apiRequest(`/api/purchase-plans/${plan.id}/status`, {
					method: "PATCH",
					body: JSON.stringify({ status: statusSelect.value }),
				});
				await refreshAllData();
			} catch (error) {
				setFormError(purchaseError, error.message || "Failed to update purchase plan status.");
			}
		});
		statusCell.appendChild(statusSelect);
		const actionsCell = row.insertCell(5);
		const deleteButton = createActionButton("Delete", "table-btn delete", async () => {
			try {
				await apiRequest(`/api/purchase-plans/${plan.id}`, { method: "DELETE" });
				await refreshAllData();
			} catch (error) {
				setFormError(purchaseError, error.message || "Failed to delete purchase plan.");
			}
		});
		actionsCell.appendChild(deleteButton);
	});
	purchaseEmptyState.style.display = purchasePlans.length ? "none" : "block";
}

function renderMovementTable() {
	movementTableBody.innerHTML = "";
	movements.forEach((record) => {
		const row = movementTableBody.insertRow();
		row.insertCell(0).textContent = record.type;
		row.insertCell(1).textContent = String(record.movementType || "").toUpperCase();
		row.insertCell(2).textContent = `${record.qty} kg`;
		row.insertCell(3).textContent = `${record.resultingQty} kg`;
		row.insertCell(4).textContent = record.reference || "-";
		row.insertCell(5).textContent = formatDateTime(record.createdAt);
	});
	movementEmptyState.style.display = movements.length ? "none" : "block";
}

function renderWeaverTable() {
	weaverTableBody.innerHTML = "";
	weaverPerformance.forEach((record) => {
		const row = weaverTableBody.insertRow();
		row.insertCell(0).textContent = record.weaverName;
		row.insertCell(1).textContent = String(record.productionCount);
		row.insertCell(2).textContent = `${record.totalMeters} m`;
		row.insertCell(3).textContent = `${record.avgMeters} m`;
		row.insertCell(4).textContent = formatDateTime(record.lastProductionAt);
	});
	weaverEmptyState.style.display = weaverPerformance.length ? "none" : "block";
}

function renderAuditTable() {
	auditTableBody.innerHTML = "";
	auditLogs.forEach((log) => {
		const row = auditTableBody.insertRow();
		row.insertCell(0).textContent = formatDateTime(log.timestamp);
		row.insertCell(1).textContent = log.module;
		row.insertCell(2).textContent = log.action;
		row.insertCell(3).textContent = log.details;
	});
	auditEmptyState.style.display = auditLogs.length ? "none" : "block";
}

function renderRecentInventoryActivity() {
	if (!recentActivityTableBody || !recentActivityEmptyState) return;
	recentActivityTableBody.innerHTML = "";
	const recentLogs = auditLogs.slice(0, 8);
	recentLogs.forEach((log) => {
		const row = recentActivityTableBody.insertRow();
		row.insertCell(0).textContent = formatDateTime(log.timestamp);
		row.insertCell(1).textContent = log.module;
		row.insertCell(2).textContent = log.action;
		row.insertCell(3).textContent = log.details;
	});
	recentActivityEmptyState.style.display = recentLogs.length ? "none" : "block";
}

function renderKpis(kpis) {
	totalSkus.textContent = String(kpis.totalSkus ?? 0);
	totalQuantity.textContent = `${kpis.totalQuantity ?? 0} kg`;
	lowStockCount.textContent = String(kpis.lowStockCount ?? 0);
	totalValue.textContent = formatCurrency(kpis.totalValue ?? 0);
	if (totalSuppliers) {
		const uniqueSuppliers = new Set(
			yarnQrInventory
				.map((item) => String(item.supplier || "").trim().toLowerCase())
				.filter(Boolean)
		);
		totalSuppliers.textContent = String(uniqueSuppliers.size);
	}
}

function buildEntryCountMap() {
	const map = new Map();
	yarnQrInventory.forEach((row) => {
		if (Number(row.is_added_to_summary) !== 1) return;
		const type = `${String(row.count || "").trim()} ${String(row.blend || "").trim()} ${String(row.twist || "").trim()}`
			.replace(/\s+/g, " ")
			.trim()
			.toLowerCase();
		map.set(type, (map.get(type) || 0) + 1);
	});
	return map;
}

async function loadInventoryFromApi() {
	const result = await apiRequest("/api/yarn-inventory-summary");
	const allSummary = Array.isArray(result.data) ? result.data : [];
	const countMap = buildEntryCountMap();
	inventoryForChart = allSummary.map((item) => {
		const key = String(item.type || "").trim().toLowerCase();
		return { ...item, entryCount: countMap.get(key) || 0 };
	});

	const query = searchInput.value.trim().toLowerCase();
	const stock = stockFilter.value;
	const minQty = Number(minQtyFilter.value);
	const maxQty = Number(maxQtyFilter.value);

	inventory = allSummary
		.map((item) => {
			const key = String(item.type || "").trim().toLowerCase();
			return { ...item, entryCount: countMap.get(key) || 0 };
		})
		.filter((item) => {
			const type = String(item.type || "").toLowerCase();
			const qty = Number(item.qty || 0);
			const reorderLevel = Number(item.reorderLevel || 0);
			if (query && !type.includes(query)) return false;
			if (stock === "low" && !(qty < reorderLevel)) return false;
			if (stock === "healthy" && !(qty >= reorderLevel)) return false;
			if (Number.isFinite(minQtyFilter.valueAsNumber) && qty < minQty) return false;
			if (Number.isFinite(maxQtyFilter.valueAsNumber) && qty > maxQty) return false;
			return true;
		});

	inventory.sort((first, second) => {
		const key = sortState.key;
		const direction = sortState.direction === "desc" ? -1 : 1;
		if (key === "firstAddedAt") {
			const left = new Date(first.first_added_at || 0).getTime();
			const right = new Date(second.first_added_at || 0).getTime();
			return (left - right) * direction;
		}
		if (key === "type") {
			return String(first.type || "").localeCompare(String(second.type || "")) * direction;
		}
		const left = Number(first[key] || 0);
		const right = Number(second[key] || 0);
		return (left - right) * direction;
	});

	renderKpis(result.kpis || {});
	renderInventoryTable();
	renderYarnInventoryPieChart();
}

async function loadPurchasePlans() {
	const result = await apiRequest("/api/purchase-plans");
	purchasePlans = Array.isArray(result.data) ? result.data : [];
	renderPurchaseTable();
}

async function loadStockMovements() {
	const result = await apiRequest("/api/stock-movements?limit=100");
	movements = Array.isArray(result.data) ? result.data : [];
	renderMovementTable();
}

async function loadWeaverPerformance() {
	const result = await apiRequest("/api/weaver-performance");
	weaverPerformance = Array.isArray(result.data) ? result.data : [];
	renderWeaverTable();
}

async function loadAuditLogs() {
	const result = await apiRequest("/api/audit-logs?limit=150");
	auditLogs = Array.isArray(result.data) ? result.data : [];
	renderAuditTable();
	renderRecentInventoryActivity();
}

async function loadYarnQrInventory() {
	const result = await apiRequest("/api/yarn-packages");
	yarnQrInventory = Array.isArray(result.data) ? result.data : [];
	renderYarnQrTable();
}

async function refreshAllData() {
	try {
		await Promise.all([
			loadPurchasePlans(),
			loadStockMovements(),
			loadWeaverPerformance(),
			loadAuditLogs(),
			loadYarnQrInventory(),
		]);
		await loadInventoryFromApi();
		clearFormError(formError);
		clearFormError(purchaseError);
		clearFormError(movementError);
		clearFormError(weaverError);
		clearFormError(yarnQrError);
		renderProductionGraph();
		renderBatchProgress();
		updateLastUpdated();
	} catch (_error) {
		setFormError(formError, "Backend connection failed. Start server and try again.");
	}
}

async function handleInventorySubmit(event) {
	event.preventDefault();
	const type = yarnTypeInput.value.trim();
	const qty = Number(yarnQtyInput.value);
	const unitCost = Number(unitCostInput.value);
	const reorderLevel = Number(reorderLevelInput.value);
	const validationMessage = validateInventory(type, qty, unitCost, reorderLevel);
	if (validationMessage) {
		setFormError(formError, validationMessage);
		return;
	}
	try {
		const payload = { type, qty, unitCost, reorderLevel };
		if (editingId) {
			await apiRequest(`/api/inventory/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
		} else {
			await apiRequest("/api/inventory", { method: "POST", body: JSON.stringify(payload) });
		}
		resetInventoryForm();
		await refreshAllData();
	} catch (error) {
		setFormError(formError, error.message || "Failed to save inventory item.");
	}
}

async function handlePurchaseSubmit(event) {
	event.preventDefault();
	const type = document.getElementById("purchaseYarnType").value.trim();
	const plannedQty = Number(document.getElementById("purchaseQty").value);
	const supplier = document.getElementById("purchaseSupplier").value.trim();
	const expectedDate = document.getElementById("purchaseDate").value;
	const validationMessage = validatePurchase(type, plannedQty, supplier);
	if (validationMessage) {
		setFormError(purchaseError, validationMessage);
		return;
	}
	try {
		await apiRequest("/api/purchase-plans", {
			method: "POST",
			body: JSON.stringify({ type, plannedQty, supplier, expectedDate }),
		});
		purchaseForm.reset();
		await refreshAllData();
	} catch (error) {
		setFormError(purchaseError, error.message || "Failed to create purchase plan.");
	}
}

async function handleMovementSubmit(event) {
	event.preventDefault();
	const type = document.getElementById("movementYarnType").value.trim();
	const movementType = document.getElementById("movementType").value;
	const qty = Number(document.getElementById("movementQty").value);
	const reference = document.getElementById("movementReference").value.trim();
	const validationMessage = validateMovement(type, qty);
	if (validationMessage) {
		setFormError(movementError, validationMessage);
		return;
	}
	try {
		await apiRequest("/api/stock-movements", {
			method: "POST",
			body: JSON.stringify({ type, movementType, qty, reference }),
		});
		movementForm.reset();
		await refreshAllData();
	} catch (error) {
		setFormError(movementError, error.message || "Failed to record stock movement.");
	}
}

async function handleWeaverSubmit(event) {
	event.preventDefault();
	const weaverName = document.getElementById("weaverName").value.trim();
	const meters = Number(document.getElementById("weaverMeters").value);
	const productionDate = document.getElementById("weaverDate").value;
	const shift = document.getElementById("weaverShift").value.trim();
	const validationMessage = validateWeaver(weaverName, meters);
	if (validationMessage) {
		setFormError(weaverError, validationMessage);
		return;
	}
	try {
		await apiRequest("/api/weaver-performance", {
			method: "POST",
			body: JSON.stringify({ weaverName, meters, productionDate, shift }),
		});
		weaverForm.reset();
		await refreshAllData();
	} catch (error) {
		setFormError(weaverError, error.message || "Failed to add weaver production.");
	}
}

function toggleSort(key) {
	if (sortState.key === key) {
		sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
		return;
	}
	sortState.key = key;
	sortState.direction = "asc";
}

function activateSection(sectionName) {
	sidebarItems.forEach((item) => {
		item.classList.toggle("active", item.dataset.section === sectionName);
	});
	sections.forEach((section) => {
		section.classList.toggle("active", section.id === `section-${sectionName}`);
	});
}

function highlightFlowStep(step) {
	flowButtons.forEach((button) => {
		button.classList.toggle("active", button.dataset.flow === step);
	});
}

function scrollToElement(element) {
	if (!element) return;
	element.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleFlowNavigation(step) {
	highlightFlowStep(step);
	if (step === "summary") {
		activateSection("dashboard");
		scrollToElement(summaryCards);
		return;
	}
	if (step === "yarn") {
		activateSection("inventory");
		qrCountInput.focus();
		scrollToElement(yarnQrForm);
		return;
	}
	if (step === "weaver") {
		activateSection("weaver");
		document.getElementById("weaverName").focus();
		return;
	}
	if (step === "batch") {
		activateSection("purchase");
		document.getElementById("purchaseYarnType").focus();
		return;
	}
	if (step === "reports") {
		activateSection("dashboard");
		scrollToElement(document.querySelector(".visual-panels"));
	}
}

function handleFlowLogin(event) {
	event.preventDefault();
	const email = loginFlowEmail.value.trim();
	const password = loginFlowPassword.value;
	if (!email || !password) {
		setFormError(loginFlowError, "Email and password are required.");
		return;
	}
	if (password.length < 4) {
		setFormError(loginFlowError, "Password must be at least 4 characters.");
		return;
	}
	clearFormError(loginFlowError);
	setFlowAuth(true);
	updateAuthGateUI();
	showToast("Dashboard opened successfully.", "success");
	handleFlowNavigation("summary");
	loginFlowForm.reset();
}

function handleFlowLogout() {
	setFlowAuth(false);
	updateAuthGateUI();
	showToast("Logged out. Please login to continue.", "warning");
}

function setQrStatus(message, tone = "info") {
	if (!qrStatus) return;
	qrStatus.textContent = message;
	qrStatus.style.color = tone === "error" ? "#b91c1c" : tone === "success" ? "#166534" : "";
}

function parseQrQuantityValue(rawValue) {
	if (typeof rawValue === "number") {
		return Number.isFinite(rawValue) ? rawValue : NaN;
	}
	if (typeof rawValue !== "string") {
		return NaN;
	}
	const value = rawValue.trim();
	if (!value) return NaN;
	const direct = Number(value);
	if (Number.isFinite(direct)) return direct;
	const match = value.match(/-?\d+(?:\.\d+)?/);
	return match ? Number(match[0]) : NaN;
}

function parseYarnQrText(rawText) {
	const value = String(rawText || "").trim();
	if (!value) return null;
	let normalized = value;
	if (normalized.startsWith("```") && normalized.endsWith("```")) {
		normalized = normalized.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
	}
	try {
		const firstParse = JSON.parse(normalized);
		const parsed = typeof firstParse === "string" ? JSON.parse(firstParse) : firstParse;
		if (!parsed || typeof parsed !== "object") return null;
		const container = parsed.yarn && typeof parsed.yarn === "object"
			? parsed.yarn
			: parsed.data && typeof parsed.data === "object"
				? parsed.data
				: parsed;
		const quantityRaw =
			container.quantity
			?? container.qty
			?? container.quantityKg
			?? container.quantity_kg
			?? container.qtyKg
			?? container.qty_kg
			?? container.weight
			?? container.netWeight
			?? container.net_weight
			?? container.Quantity
			?? container.QTY;
		return {
			count: String(container.count ?? "").trim(),
			twist: String(container.twist ?? "").trim(),
			blend: String(container.blend ?? "").trim(),
			lot_number: String(container.lot_number ?? container.lotNumber ?? container.lot ?? "").trim(),
			supplier: String(container.supplier ?? "").trim(),
			quantity: parseQrQuantityValue(quantityRaw),
		};
	} catch (_error) {
		return null;
	}
}

function fillYarnQrForm(parsed) {
	qrCountInput.value = parsed.count || "";
	qrTwistInput.value = parsed.twist || "";
	qrBlendInput.value = parsed.blend || "";
	qrLotNumberInput.value = parsed.lot_number || "";
	qrSupplierInput.value = parsed.supplier || "";
	if (Number.isFinite(parsed.quantity) && parsed.quantity > 0) {
		qrQuantityInput.value = String(parsed.quantity);
	}
}

function getYarnQrPayloadFromForm() {
	return {
		count: qrCountInput.value.trim(),
		twist: qrTwistInput.value.trim(),
		blend: qrBlendInput.value.trim(),
		lot_number: qrLotNumberInput.value.trim(),
		supplier: qrSupplierInput.value.trim(),
		quantity: Number(qrQuantityInput.value),
	};
}

function resetYarnQrForm() {
	yarnQrForm.reset();
	clearFormError(yarnQrError);
}

function renderYarnQrTable() {
	yarnQrTableBody.innerHTML = "";
	yarnQrInventory.forEach((record) => {
		const row = yarnQrTableBody.insertRow();
		const isAddedToSummary = Number(record.is_added_to_summary) === 1;
		row.insertCell(0).textContent = String(record.id);
		row.insertCell(1).textContent = record.count;
		row.insertCell(2).textContent = record.twist;
		row.insertCell(3).textContent = record.blend;
		row.insertCell(4).textContent = record.lot_number;
		row.insertCell(5).textContent = record.supplier;
		row.insertCell(6).textContent = `${record.quantity} kg`;
		row.insertCell(7).textContent = formatDateTime(record.date_added);
		const summaryCell = row.insertCell(8);
		const actionsWrap = document.createElement("div");
		actionsWrap.className = "summary-actions";
		if (isAddedToSummary) {
			const addedBadge = document.createElement("span");
			addedBadge.className = "status-badge healthy";
			addedBadge.textContent = "Added";
			actionsWrap.appendChild(addedBadge);
		} else {
			const addButton = createActionButton("Add", "table-btn edit", async () => {
				try {
					await apiRequest(`/api/yarn-packages/${record.id}/add-to-summary`, { method: "PATCH", body: JSON.stringify({}) });
					await refreshAllData();
					showToast("Entry added to summary.", "success");
				} catch (error) {
					setFormError(yarnQrError, error.message || "Failed to add entry to summary.");
				}
			});
			actionsWrap.appendChild(addButton);
		}
		const deleteButton = createActionButton("Delete", "table-btn delete", async () => {
			const shouldDelete = window.confirm(`Delete yarn package lot ${record.lot_number}?`);
			if (!shouldDelete) return;
			try {
				await apiRequest(`/api/yarn-packages/${record.id}`, { method: "DELETE" });
				await refreshAllData();
				showToast("Yarn package deleted.", "warning");
			} catch (error) {
				setFormError(yarnQrError, error.message || "Failed to delete yarn package.");
			}
		});
		actionsWrap.appendChild(deleteButton);
		summaryCell.appendChild(actionsWrap);
	});
	yarnQrEmptyState.style.display = yarnQrInventory.length ? "none" : "block";
}

async function handleYarnQrSubmit(event) {
	event.preventDefault();
	const payload = getYarnQrPayloadFromForm();
	const validationMessage = validateYarnQrPayload(payload);
	if (validationMessage) {
		setFormError(yarnQrError, validationMessage);
		return;
	}
	try {
		const response = await apiRequest("/api/yarn-packages", { method: "POST", body: JSON.stringify(payload) });
		resetYarnQrForm();
		await refreshAllData();
		showToast(response.message || "Yarn inventory record processed.", response.duplicate ? "warning" : "success");
	} catch (error) {
		setFormError(yarnQrError, error.message || "Failed to add yarn inventory record.");
	}
}

async function stopQrScanner() {
	if (!qrScanner || !qrScannerActive) {
		setQrStatus("Scanner is idle.");
		return;
	}
	try {
		await qrScanner.stop();
		await qrScanner.clear();
		qrScannerActive = false;
		setQrStatus("Scanner stopped.");
	} catch (_error) {
		setQrStatus("Unable to stop scanner cleanly.", "error");
	}
}

async function startQrScanner() {
	if (!window.Html5Qrcode) {
		setQrStatus("QR scanner library not loaded.", "error");
		setFormError(yarnQrError, "QR scanner library failed to load.");
		return;
	}
	if (qrScannerActive) {
		setQrStatus("Scanner already running.");
		return;
	}
	clearFormError(yarnQrError);
	lastScannedText = "";
	setQrStatus("Requesting camera permission...");
	if (!qrScanner) {
		qrScanner = new Html5Qrcode("qrReader");
	}
	try {
		await qrScanner.start(
			{ facingMode: "environment" },
			{ fps: 10, qrbox: { width: 250, height: 250 } },
			async (decodedText) => {
				if (!decodedText || decodedText === lastScannedText) return;
				lastScannedText = decodedText;
				const parsed = parseYarnQrText(decodedText);
				if (!parsed || !parsed.count || !parsed.twist || !parsed.blend || !parsed.lot_number || !parsed.supplier) {
					setQrStatus("Invalid QR payload.", "error");
					setFormError(yarnQrError, "Unable to parse QR data.");
					return;
				}
				fillYarnQrForm(parsed);
				setQrStatus("QR scanned. Verify quantity and save.", "success");
				qrQuantityInput.focus();
				await stopQrScanner();
			},
			() => {
				// Ignore decode misses
			}
		);
		qrScannerActive = true;
		setQrStatus("Scanner running. Point camera at package QR.");
	} catch (_error) {
		setQrStatus("Camera access failed. Check permissions.", "error");
		setFormError(yarnQrError, "Unable to start camera scanner.");
	}
}

inventoryForm.addEventListener("submit", handleInventorySubmit);
purchaseForm.addEventListener("submit", handlePurchaseSubmit);
movementForm.addEventListener("submit", handleMovementSubmit);
weaverForm.addEventListener("submit", handleWeaverSubmit);
yarnQrForm.addEventListener("submit", handleYarnQrSubmit);
loginFlowForm.addEventListener("submit", handleFlowLogin);

resetButton.addEventListener("click", resetInventoryForm);

searchInput.addEventListener("input", () => {
	window.clearTimeout(searchDebounce);
	searchDebounce = window.setTimeout(() => {
		loadInventoryFromApi().catch(() => setFormError(formError, "Unable to load inventory list."));
	}, 250);
});
stockFilter.addEventListener("change", () => loadInventoryFromApi().catch(() => setFormError(formError, "Unable to load inventory list.")));
minQtyFilter.addEventListener("input", () => {
	window.clearTimeout(searchDebounce);
	searchDebounce = window.setTimeout(() => {
		loadInventoryFromApi().catch(() => setFormError(formError, "Unable to apply quantity filter."));
	}, 250);
});
maxQtyFilter.addEventListener("input", () => {
	window.clearTimeout(searchDebounce);
	searchDebounce = window.setTimeout(() => {
		loadInventoryFromApi().catch(() => setFormError(formError, "Unable to apply quantity filter."));
	}, 250);
});

resetFiltersBtn.addEventListener("click", resetInventoryFilters);
exportCsvBtn.addEventListener("click", exportInventoryCsv);
exportJsonBtn.addEventListener("click", exportDashboardReport);

if (refreshAllBtn) {
	refreshAllBtn.addEventListener("click", async () => {
		await refreshAllData();
		showToast("Workspace data refreshed.", "success");
	});
}
if (logoutFlowBtn) {
	logoutFlowBtn.addEventListener("click", handleFlowLogout);
}
sortButtons.forEach((button) => {
	button.addEventListener("click", () => {
		toggleSort(button.dataset.sort);
		loadInventoryFromApi().catch(() => setFormError(formError, "Unable to load inventory list."));
	});
});
sidebarItems.forEach((item) => {
	item.addEventListener("click", () => activateSection(item.dataset.section));
});
flowButtons.forEach((button) => {
	button.addEventListener("click", () => handleFlowNavigation(button.dataset.flow));
});

if (startQrScannerBtn) {
	startQrScannerBtn.addEventListener("click", () => startQrScanner().catch(() => setFormError(yarnQrError, "Failed to start QR scanner.")));
}
if (stopQrScannerBtn) {
	stopQrScannerBtn.addEventListener("click", () => stopQrScanner().catch(() => setFormError(yarnQrError, "Failed to stop QR scanner.")));
}

window.addEventListener("beforeunload", () => {
	if (qrScannerActive) {
		stopQrScanner().catch(() => {
			// no-op
		});
	}
});

refreshAllData();
updateAuthGateUI();

function addYarn() {
	inventoryForm.requestSubmit();
}
