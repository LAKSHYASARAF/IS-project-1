/* ============================================================
   File Integrity Checker — SHA-256 Baselines (LocalStorage)
   Author: You :)
   What it does (in plain words):
   - Hash any file using SHA-256 in the browser (Web Crypto API)
   - Save that hash as a "baseline" with file metadata
   - Later, verify a file by comparing its hash to all saved baselines
   No servers. Everything is inside YOUR browser.
   ============================================================ */

/* ---------- DOM shortcuts ---------- */
const $ = (id) => document.getElementById(id);

const regFile   = $("regFile");
const verFile   = $("verFile");
const regResult = $("regResult");
const verResult = $("verResult");

const btnHashSave = $("btnHashSave");
const btnClearReg = $("btnClearReg");
const btnVerify   = $("btnVerify");
const btnClearVer = $("btnClearVer");
const btnExport   = $("btnExport");
const btnClearAll = $("btnClearAll");

const recordsBody = $("recordsBody");

/* ---------- Storage key ---------- */
const STORE_KEY = "integrityRecords_v1";

/* ---------- Utility: arrayBuffer -> hex string ---------- */
function toHex(buffer) {
  // Turn ArrayBuffer into a readable hex string like "a3b4c5..."
  const bytes = new Uint8Array(buffer);
  const hex = [];
  for (const b of bytes) {
    // padStart(2,'0') keeps 0x0a as "0a" and not "a"
    hex.push(b.toString(16).padStart(2, "0"));
  }
  return hex.join("");
}

/* ---------- SHA-256 of any Blob/File ---------- */
async function sha256OfFile(file) {
  // Read file -> ArrayBuffer
  const arrayBuf = await file.arrayBuffer();
  // Use browser's crypto API (fast, safe)
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuf);
  return toHex(hashBuffer);
}

/* ---------- LocalStorage helpers ---------- */
function loadRecords() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecords(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

/* ---------- Render saved records in table ---------- */
function renderRecords() {
  const list = loadRecords();
  if (!list.length) {
    recordsBody.innerHTML = `<tr><td colspan="6"><em class="muted">No baselines yet. Save one above.</em></td></tr>`;
    return;
  }
  recordsBody.innerHTML = list.map((r, i) => {
    const when = new Date(r.savedAt).toLocaleString();
    const sizeKb = (r.size / 1024).toFixed(2) + " KB";
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${sizeKb}</td>
        <td>${when}</td>
        <td class="mono">
          <span class="copyable" data-copy="${r.hash}" title="Click to copy">${r.hash}</span>
        </td>
        <td>
          <button class="btn secondary" data-action="quick-verify" data-id="${r.id}">Verify with File…</button>
          <button class="btn danger" data-action="delete" data-id="${r.id}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

/* ---------- Simple HTML escape (for filenames) ---------- */
function escapeHtml(s) {
  return (s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* ---------- Add a new record ---------- */
function addRecord({ name, size, lastModified, hash }) {
  const list = loadRecords();
  const id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  list.push({
    id,
    name,
    size,
    lastModified,
    hash,
    savedAt: Date.now()
  });
  saveRecords(list);
  renderRecords();
  return id;
}

/* ---------- Delete a record by id ---------- */
function deleteRecord(id) {
  const list = loadRecords().filter(r => r.id !== id);
  saveRecords(list);
  renderRecords();
}

/* ---------- Clear everything ---------- */
function clearAllRecords() {
  localStorage.removeItem(STORE_KEY);
  renderRecords();
}

/* ---------- Small helper: copy text to clipboard ---------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fallback if clipboard API blocked
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(t);
    return ok;
  }
}

/* ---------- UI feedback helpers ---------- */
function show(regOrVerEl, msg, kind = "") {
  regOrVerEl.className = `result ${kind}`;
  regOrVerEl.textContent = msg;
}

/* ============================================================
   A) REGISTER FLOW (hash & save baseline)
   ============================================================ */
btnHashSave.addEventListener("click", async () => {
  const f = regFile.files?.[0];
  if (!f) {
    show(regResult, "Please choose a file first.", "warn");
    return;
  }
  show(regResult, "Hashing… please wait.");
  try {
    const hash = await sha256OfFile(f);
    const id = addRecord({
      name: f.name,
      size: f.size,
      lastModified: f.lastModified,
      hash
    });
    show(
      regResult,
      `Saved baseline ✅
File: ${f.name}
Size: ${f.size} bytes
SHA-256: ${hash}`,
      "ok"
    );
  } catch (e) {
    show(regResult, `Failed to hash file. ${e}`, "bad");
  }
});

btnClearReg.addEventListener("click", () => {
  regFile.value = "";
  show(regResult, "Selection cleared.", "");
});

/* ============================================================
   B) VERIFY FLOW
   - Hash chosen file
   - Compare with ALL saved baselines
   - Show match / mismatch result
   ============================================================ */
btnVerify.addEventListener("click", async () => {
  const f = verFile.files?.[0];
  if (!f) {
    show(verResult, "Please choose a file to verify.", "warn");
    return;
  }
  show(verResult, "Computing hash…");
  try {
    const currentHash = await sha256OfFile(f);
    const list = loadRecords();

    if (!list.length) {
      show(
        verResult,
        `No baselines saved yet.
Current file's SHA-256:
${currentHash}`,
        "warn"
      );
      return;
    }

    const match = list.find(r => r.hash === currentHash);
    if (match) {
      show(
        verResult,
        `✔ MATCH: This file matches a saved baseline.
Filename (baseline): ${match.name}
Saved on: ${new Date(match.savedAt).toLocaleString()}
SHA-256: ${currentHash}`,
        "ok"
      );
    } else {
      // no exact hash match — we can still help a bit with a "closest by name" hint
      const sameName = list.filter(r => r.name === f.name);
      if (sameName.length) {
        show(
          verResult,
          `✖ NO MATCH for this file's hash.
This file's SHA-256:
${currentHash}

You do have baseline(s) with the same filename:
${sameName.map(r => `• ${r.name} — ${r.hash}`).join("\n")}
If this was supposed to be identical, the file has changed.`,
          "bad"
        );
      } else {
        show(
          verResult,
          `✖ NO MATCH found.
This file's SHA-256:
${currentHash}

Tip: Save a baseline for this file first, then verify next time.`,
          "bad"
        );
      }
    }
  } catch (e) {
    show(verResult, `Failed to hash file. ${e}`, "bad");
  }
});

btnClearVer.addEventListener("click", () => {
  verFile.value = "";
  show(verResult, "Selection cleared.", "");
});

/* ============================================================
   C) TABLE actions: copy hash, quick-verify, delete
   ============================================================ */
recordsBody.addEventListener("click", async (ev) => {
  const target = ev.target;

  // Copy hash if clicked
  if (target.classList.contains("copyable")) {
    const text = target.getAttribute("data-copy");
    const ok = await copyText(text);
    target.title = ok ? "Copied!" : "Copy failed";
    if (ok) target.style.filter = "brightness(1.2)";
    setTimeout(() => {
      target.title = "Click to copy";
      target.style.filter = "";
    }, 900);
    return;
  }

  // Buttons with data-action
  const action = target.getAttribute("data-action");
  if (!action) return;

  const id = target.getAttribute("data-id");
  if (action === "delete") {
    if (confirm("Delete this baseline?")) {
      deleteRecord(id);
    }
    return;
  }

  if (action === "quick-verify") {
    // Nice UX: ask for file, hash it, compare directly to this record
    const input = document.createElement("input");
    input.type = "file";
    input.style.display = "none";
    document.body.appendChild(input);
    input.addEventListener("change", async () => {
      const f = input.files?.[0];
      document.body.removeChild(input);
      if (!f) return;

      const list = loadRecords();
      const rec = list.find(r => r.id === id);
      if (!rec) return;

      show(verResult, "Computing hash for quick verify…");
      try {
        const h = await sha256OfFile(f);
        if (h === rec.hash) {
          show(
            verResult,
            `✔ MATCH with selected baseline.
Baseline: ${rec.name} (${new Date(rec.savedAt).toLocaleString()})
SHA-256: ${h}`,
            "ok"
          );
        } else {
          show(
            verResult,
            `✖ MISMATCH with selected baseline.
Baseline: ${rec.name}
Baseline SHA-256: ${rec.hash}
This file's SHA-256: ${h}`,
            "bad"
          );
        }
      } catch (e) {
        show(verResult, `Failed to hash file. ${e}`, "bad");
      }
    }, { once: true });
    input.click();
  }
});

/* ============================================================
   D) Export / Delete All
   ============================================================ */
btnExport.addEventListener("click", () => {
  const data = JSON.stringify(loadRecords(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "integrity-baselines.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

btnClearAll.addEventListener("click", () => {
  if (confirm("Delete ALL saved baselines? This cannot be undone.")) {
    clearAllRecords();
  }
});

/* ============================================================
   Init on page load
   ============================================================ */
renderRecords();
