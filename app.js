let stateData = null;
let selectedPaceWindow = "30";
let activeSeriesFilter = "all";
let activeStatusFilter = "all";
let milestoneName = "Road to Volume 21";
let milestoneStems = new Set();
let selectedHeatmapDate = null;
let dailyDetailsMap = new Map();
let bookLookupMap = new Map();

const fmtNum = (n) => Math.round(n).toLocaleString("en-US");
const fmtDec = (n, d = 1) => Number(n).toFixed(d);

function getCoverUrl(stem, gen, coverFile) {
  const qs = `stem=${encodeURIComponent(stem)}&gen=${gen}&file=${encodeURIComponent(coverFile)}`;
  return `http://rezero.localhost/cover?${qs}`;
}

const SERIES_LABELS = {
  main: "本編 (Main Novels)",
  tanpenshuu: "短編集 (Tanpenshuu)",
  ex: "Ex (EX Novels)",
  shouhenshuu: "小編集 (Shouhenshuu)",
};

function getSeriesCategoryLabel(slug) {
  if (stateData && stateData.series) {
    const found = stateData.series.find((s) => s.slug === slug);
    if (found && found.categoryLabel) return found.categoryLabel;
  }
  return SERIES_LABELS[slug] || slug;
}

function renderSeriesFilterStrip() {
  const group = document.getElementById("seriesFilterGroup");
  if (!group || !stateData || !stateData.series) return;
  group.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.className = `strip-btn${activeSeriesFilter === "all" ? " active" : ""}`;
  allBtn.dataset.series = "all";
  allBtn.textContent = "ALL";
  allBtn.onclick = () => {
    activeSeriesFilter = "all";
    updateFilterButtons();
    renderBookshelf();
  };
  group.appendChild(allBtn);

  for (const s of stateData.series) {
    const btn = document.createElement("button");
    btn.className = `strip-btn${activeSeriesFilter === s.slug ? " active" : ""}`;
    btn.dataset.series = s.slug;
    btn.textContent = s.filterLabel || s.name.toUpperCase();
    btn.onclick = () => {
      activeSeriesFilter = s.slug;
      updateFilterButtons();
      renderBookshelf();
    };
    group.appendChild(btn);
  }
}

const WEEKDAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function formatHHMM(totalSeconds) {
  const totalMin = Math.round((totalSeconds || 0) / 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m`;
}

function toDateKey(tsMs) {
  const d = new Date(tsMs);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shortBookTitle(title) {
  return (
    title
      .replace(/^Re[：:_]ゼロから始める異世界生活\s*/i, "")
      .replace(/^Ｒｅ[：:_]ゼロから始める異世界生活\s*/i, "")
      .trim() || title
  );
}

function formatDateEditorial(dateObj) {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function buildDailyDetailsMap() {
  dailyDetailsMap = new Map();
  bookLookupMap = new Map();
  if (!stateData) return;

  for (const s of stateData.series || []) {
    for (const b of s.books || []) {
      bookLookupMap.set(b.stem, b);
    }
  }

  for (const sess of stateData.sessions || []) {
    if (!sess.endedAt) continue;
    const dKey = toDateKey(sess.endedAt);
    if (!dailyDetailsMap.has(dKey)) {
      dailyDetailsMap.set(dKey, {
        date: dKey,
        totalChars: 0,
        totalSec: 0,
        sessionCount: 0,
        booksMap: new Map(),
      });
    }
    const dayEntry = dailyDetailsMap.get(dKey);
    dayEntry.totalChars += sess.charactersRead || 0;
    dayEntry.totalSec += sess.readingTime || 0;
    dayEntry.sessionCount += 1;

    if (!dayEntry.booksMap.has(sess.stem)) {
      dayEntry.booksMap.set(sess.stem, {
        stem: sess.stem,
        title: sess.title,
        series: sess.series,
        chars: 0,
        sec: 0,
        sessions: 0,
      });
    }
    const bEntry = dayEntry.booksMap.get(sess.stem);
    bEntry.chars += sess.charactersRead || 0;
    bEntry.sec += sess.readingTime || 0;
    bEntry.sessions += 1;
  }

  if (!selectedHeatmapDate && dailyDetailsMap.size > 0) {
    const sortedKeys = Array.from(dailyDetailsMap.keys()).sort();
    selectedHeatmapDate = sortedKeys[sortedKeys.length - 1];
  }
}

function computePaceStats() {
  if (!stateData) return { cph: 0, charsPerDay: 0, hoursPerDay: 0, label: "" };

  const nowMs = stateData.generatedAt || Date.now();
  const sessions = stateData.sessions || [];

  let filtered = sessions;
  let daysCount = 30;
  let label = "30 DAYS";

  if (selectedPaceWindow !== "all") {
    daysCount = parseInt(selectedPaceWindow, 10);
    const cutoff = nowMs - daysCount * 86400 * 1000;
    filtered = sessions.filter((s) => s.endedAt >= cutoff);
    label = `${daysCount} DAYS`;
  } else {
    if (sessions.length > 0) {
      const firstMs = sessions[0].endedAt;
      daysCount = Math.max(1, (nowMs - firstMs) / (86400 * 1000));
    }
    label = "ALL TIME";
  }

  const totalChars = filtered.reduce((acc, s) => acc + s.charactersRead, 0);
  const totalSec = filtered.reduce((acc, s) => acc + s.readingTime, 0);
  const totalHours = totalSec / 3600;

  const cph = totalHours > 0 ? totalChars / totalHours : 0;
  const charsPerDay = daysCount > 0 ? totalChars / daysCount : 0;
  const hoursPerDay = daysCount > 0 ? totalHours / daysCount : 0;

  return {
    cph,
    charsPerDay,
    hoursPerDay,
    totalChars,
    totalHours,
    daysCount,
    label,
  };
}

async function saveChecklist() {
  const payload = {
    name: milestoneName,
    stems: Array.from(milestoneStems),
  };
  try {
    await window.__TAURI__.core.invoke("save_checklist", { payload });
  } catch (e) {
    console.error("Failed to save checklist:", e);
  }
}

function toggleMilestoneStem(stem) {
  if (milestoneStems.has(stem)) {
    milestoneStems.delete(stem);
  } else {
    milestoneStems.add(stem);
  }
  saveChecklist();
  renderAll();
}

function renderOverview(pace) {
  const ov = stateData.overall;
  document.getElementById("statePathSubtitle").textContent =
    `SOURCE: ${stateData.stateDir}`;

  document.getElementById("overallPctText").textContent = `${fmtDec(ov.progressPct, 2)}%`;
  document.getElementById("overallBooksPill").textContent =
    `${ov.completedBooks} / ${ov.totalBooks}`;
  document.getElementById("overallProgressBar").style.width =
    `${Math.min(100, ov.progressPct)}%`;

  document.getElementById("overallReadChars").textContent = fmtNum(ov.readChars);
  document.getElementById("overallRemChars").textContent = fmtNum(ov.remainingChars);
  document.getElementById("overallTotalChars").textContent = fmtNum(ov.totalChars);
  document.getElementById("overallTimeLogged").textContent = formatHHMM(ov.readingTimeSec);

  document.getElementById("paceCardEyebrow").textContent =
    `RECORDED PACE — ${pace.label}`;
  document.getElementById("paceCharsPerDay").textContent = fmtNum(pace.charsPerDay);
  document.getElementById("paceCharsPerHour").textContent =
    `${fmtNum(pace.cph)} chars/hr`;
  document.getElementById("paceHoursPerDay").textContent =
    `${formatHHMM(pace.hoursPerDay * 3600)} / day`;

  const nowMs = stateData.generatedAt || Date.now();
  if (pace.charsPerDay > 0) {
    const daysRem = ov.remainingChars / pace.charsPerDay;
    const secRem = pace.cph > 0 ? (ov.remainingChars / pace.cph) * 3600 : 0;
    const finishDate = new Date(nowMs + daysRem * 86400 * 1000);
    document.getElementById("overallFinishDate").textContent =
      formatDateEditorial(finishDate);
    document.getElementById("overallTimeRemaining").textContent =
      `${formatHHMM(secRem)} (${fmtDec(daysRem, 1)} days)`;
  } else {
    document.getElementById("overallFinishDate").textContent = "—";
    document.getElementById("overallTimeRemaining").textContent = "—";
  }
}

function renderSeriesTable(pace) {
  const tbody = document.getElementById("seriesTableBody");
  const tfoot = document.getElementById("seriesTableFoot");
  tbody.innerHTML = "";
  const nowMs = stateData.generatedAt || Date.now();

  for (const s of stateData.series) {
    const secRem = pace.cph > 0 ? (s.remainingChars / pace.cph) * 3600 : 0;
    const daysRem = pace.charsPerDay > 0 ? s.remainingChars / pace.charsPerDay : 0;
    const finishStr =
      s.remainingChars === 0
        ? "COMPLETED"
        : pace.charsPerDay > 0
        ? `${formatDateEditorial(new Date(nowMs + daysRem * 86400 * 1000))} (${fmtDec(daysRem, 1)}d)`
        : "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="series-name-cell" data-slug="${s.slug}">
        ${s.name}
        <span class="series-sub-tag">[${s.shelf}]</span>
      </td>
      <td class="center">
        <strong>${s.completedBooks}</strong> / ${s.totalBooks}
        ${s.inProgressBooks > 0 ? `<span style="color:var(--crimson);font-size:11px"> (+${s.inProgressBooks})</span>` : ""}
      </td>
      <td class="num">${fmtNum(s.readChars)}</td>
      <td class="num">${fmtNum(s.totalChars)}</td>
      <td class="num">${fmtNum(s.remainingChars)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="sharp-bar" style="flex:1;height:10px;">
            <div class="sharp-bar-fill" style="width:${Math.min(100, s.progressPct)}%"></div>
          </div>
          <span class="num" style="min-width:48px;font-weight:700;font-size:12px;">${fmtDec(s.progressPct, 2)}%</span>
        </div>
      </td>
      <td class="num">${formatHHMM(secRem)}</td>
      <td class="num">${finishStr}</td>
    `;

    tr.querySelector(".series-name-cell").onclick = () => {
      activeSeriesFilter = s.slug;
      updateFilterButtons();
      renderBookshelf();
      document.getElementById("sec-books").scrollIntoView({ behavior: "smooth" });
    };

    tbody.appendChild(tr);
  }

  const ov = stateData.overall;
  const totSec = pace.cph > 0 ? (ov.remainingChars / pace.cph) * 3600 : 0;
  const totDays = pace.charsPerDay > 0 ? ov.remainingChars / pace.charsPerDay : 0;
  const totFinish =
    pace.charsPerDay > 0
      ? `${formatDateEditorial(new Date(nowMs + totDays * 86400 * 1000))} (${fmtDec(totDays, 1)}d)`
      : "—";

  tfoot.innerHTML = `
    <tr>
      <td>TOTAL / 全シリーズ合計</td>
      <td class="center">${ov.completedBooks} / ${ov.totalBooks}</td>
      <td class="num">${fmtNum(ov.readChars)}</td>
      <td class="num">${fmtNum(ov.totalChars)}</td>
      <td class="num">${fmtNum(ov.remainingChars)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="sharp-bar" style="flex:1;height:10px;">
            <div class="sharp-bar-fill" style="width:${Math.min(100, ov.progressPct)}%"></div>
          </div>
          <span class="num" style="min-width:48px;font-weight:700;font-size:12px;">${fmtDec(ov.progressPct, 2)}%</span>
        </div>
      </td>
      <td class="num">${formatHHMM(totSec)}</td>
      <td class="num">${totFinish}</td>
    </tr>
  `;
}

function renderMilestone(pace) {
  const allBooks = stateData.series.flatMap((s) => s.books);
  const selectedBooks = allBooks.filter((b) => milestoneStems.has(b.stem));

  const totalChars = selectedBooks.reduce((a, b) => a + b.totalChars, 0);
  const readChars = selectedBooks.reduce((a, b) => a + b.readChars, 0);
  const remChars = selectedBooks.reduce((a, b) => a + b.remainingChars, 0);
  const pct = totalChars > 0 ? (readChars / totalChars) * 100 : 0;

  const activeSec = pace.cph > 0 ? (remChars / pace.cph) * 3600 : 0;
  const daysLeft = pace.charsPerDay > 0 ? remChars / pace.charsPerDay : 0;
  const nowMs = stateData.generatedAt || Date.now();
  const finishStr =
    remChars === 0
      ? "COMPLETED"
      : pace.charsPerDay > 0
      ? formatDateEditorial(new Date(nowMs + daysLeft * 86400 * 1000))
      : "—";

  document.getElementById("msRemChars").textContent = `${fmtNum(remChars)}`;
  document.getElementById("msActiveHours").textContent = formatHHMM(activeSec);
  document.getElementById("msDaysLeft").textContent = `${fmtDec(daysLeft, 1)} days`;
  document.getElementById("msFinishDate").textContent = finishStr;

  document.getElementById("msProgressBar").style.width = `${Math.min(100, pct)}%`;
  document.getElementById("msProgressLabel").textContent =
    `${fmtNum(readChars)} / ${fmtNum(totalChars)} CHARS READ (${fmtDec(pct, 1)}%)`;
  document.getElementById("msBooksCountLabel").textContent =
    `${selectedBooks.length} VOLUMES IN CHECKLIST`;

  const tbody = document.getElementById("milestoneTableBody");
  tbody.innerHTML = "";

  selectedBooks.forEach((b, idx) => {
    const tr = document.createElement("tr");
    const estSec = pace.cph > 0 ? (b.remainingChars / pace.cph) * 3600 : 0;
    const statusText =
      b.status === "completed"
        ? "DONE"
        : b.status === "in_progress"
        ? `${fmtDec(b.progressPct, 1)}%`
        : "UNREAD";

    tr.innerHTML = `
      <td class="center">${String(idx + 1).padStart(2, "0")}</td>
      <td style="font-family:var(--font-mincho);font-weight:700;">${shortBookTitle(b.title)}</td>
      <td>${getSeriesCategoryLabel(b.series)}</td>
      <td class="center"><span class="tbl-status ${b.status}">${statusText}</span></td>
      <td class="num">${fmtNum(b.readChars)}</td>
      <td class="num">${fmtNum(b.totalChars)}</td>
      <td class="num"><strong>${fmtNum(b.remainingChars)}</strong></td>
      <td class="num">${formatHHMM(estSec)}</td>
      <td class="center">
        <button class="tbl-remove-btn" data-stem="${b.stem}">REMOVE</button>
      </td>
    `;
    tr.querySelector(".tbl-remove-btn").onclick = () => toggleMilestoneStem(b.stem);
    tbody.appendChild(tr);
  });
}

function getHeatmapLevel(chars) {
  if (!chars || chars <= 0) return 0;
  if (chars < 15000) return 1;
  if (chars < 30000) return 2;
  if (chars < 45000) return 3;
  return 4;
}

function renderHeatmap() {
  const board = document.getElementById("heatmapBoard");
  if (!board) return;
  board.innerHTML = "";

  const allDates = Array.from(dailyDetailsMap.keys()).sort();
  const nowMs = stateData.generatedAt || Date.now();
  const endDate = new Date(nowMs);
  endDate.setHours(12, 0, 0, 0);

  let startDate;
  if (allDates.length > 0) {
    startDate = new Date(allDates[0] + "T12:00:00");
  } else {
    startDate = new Date(nowMs - 180 * 86400 * 1000);
    startDate.setHours(12, 0, 0, 0);
  }

  // Align start to Sunday and end to Saturday
  const firstSun = new Date(startDate);
  firstSun.setDate(firstSun.getDate() - firstSun.getDay());

  const lastSat = new Date(endDate);
  lastSat.setDate(lastSat.getDate() + (6 - lastSat.getDay()));

  const weeks = [];
  const monthLabels = [];
  let lastMonth = -1;

  let cursor = new Date(firstSun);
  let weekIdx = 0;

  while (cursor <= lastSat) {
    const weekDays = [];
    for (let dow = 0; dow < 7; dow++) {
      const dKey = toDateKey(cursor.getTime());
      const inRange = cursor >= startDate && cursor <= endDate;
      const month = cursor.getMonth();
      if (inRange && dow === 0 && month !== lastMonth) {
        monthLabels.push({ weekIdx, text: `${MONTH_NAMES[month]} '${String(cursor.getFullYear()).slice(2)}` });
        lastMonth = month;
      } else if (inRange && weekIdx === 0 && lastMonth === -1) {
        monthLabels.push({ weekIdx: 0, text: `${MONTH_NAMES[month]} '${String(cursor.getFullYear()).slice(2)}` });
        lastMonth = month;
      }

      weekDays.push({
        dKey,
        inRange,
        dayData: dailyDetailsMap.get(dKey) || null,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(weekDays);
    weekIdx++;
  }

  // Compute total active days & total span days
  const totalSpanDays = Math.round((endDate - startDate) / (86400 * 1000)) + 1;
  document.getElementById("heatmapSummaryLabel").textContent =
    `${dailyDetailsMap.size} ACTIVE DAYS / ${totalSpanDays} TOTAL DAYS`;

  // Month row
  const monthsRow = document.createElement("div");
  monthsRow.className = "hm-months-row";
  for (const ml of monthLabels) {
    const span = document.createElement("span");
    span.className = "hm-month-label";
    span.style.left = `${34 + ml.weekIdx * 18}px`;
    span.textContent = ml.text;
    monthsRow.appendChild(span);
  }
  board.appendChild(monthsRow);

  // Body row: weekday labels + week columns
  const bodyRow = document.createElement("div");
  bodyRow.className = "hm-body-row";

  const weekdaysCol = document.createElement("div");
  weekdaysCol.className = "hm-weekdays";
  WEEKDAY_NAMES.forEach((w, i) => {
    const div = document.createElement("div");
    div.textContent = i % 2 === 1 ? w : "";
    weekdaysCol.appendChild(div);
  });
  bodyRow.appendChild(weekdaysCol);

  const weeksGrid = document.createElement("div");
  weeksGrid.className = "hm-weeks-grid";

  for (const week of weeks) {
    const col = document.createElement("div");
    col.className = "hm-week-col";

    for (const cell of week) {
      const tile = document.createElement("div");
      if (!cell.inRange) {
        tile.className = "hm-tile out-of-range";
      } else {
        const chars = cell.dayData ? cell.dayData.totalChars : 0;
        const sec = cell.dayData ? cell.dayData.totalSec : 0;
        const cph = sec > 0 ? (chars / (sec / 3600)) : 0;
        const lv = getHeatmapLevel(chars);
        const isSel = cell.dKey === selectedHeatmapDate;

        tile.className = `hm-tile lv-${lv}${isSel ? " selected" : ""}`;
        tile.dataset.date = cell.dKey;
        const dispDate = cell.dKey.replace(/-/g, ".");
        tile.title = chars > 0
          ? `${dispDate} — ${fmtNum(chars)} chars · ${formatHHMM(sec)} · ${fmtNum(cph)} chars/hr`
          : `${dispDate} — No reading logged`;

        tile.onclick = () => {
          selectedHeatmapDate = cell.dKey;
          board.querySelectorAll(".hm-tile.selected").forEach((el) => el.classList.remove("selected"));
          tile.classList.add("selected");
          renderDayInspector(cell.dKey);
        };
      }
      col.appendChild(tile);
    }
    weeksGrid.appendChild(col);
  }

  bodyRow.appendChild(weeksGrid);
  board.appendChild(bodyRow);

  if (selectedHeatmapDate) {
    renderDayInspector(selectedHeatmapDate);
  }
}

function renderDayInspector(dateKey) {
  const dObj = new Date(dateKey + "T12:00:00");
  const dow = WEEKDAY_NAMES[dObj.getDay()];
  const dispDate = `${dateKey.replace(/-/g, ".")} (${dow})`;

  const dayData = dailyDetailsMap.get(dateKey);
  const totalChars = dayData ? dayData.totalChars : 0;
  const totalSec = dayData ? dayData.totalSec : 0;
  const cph = totalSec > 0 ? totalChars / (totalSec / 3600) : 0;
  const sessCount = dayData ? dayData.sessionCount : 0;

  document.getElementById("inspDateTitle").textContent = dispDate;
  document.getElementById("inspTotalChars").textContent = `${fmtNum(totalChars)} chars`;
  document.getElementById("inspTotalTime").textContent = formatHHMM(totalSec);
  document.getElementById("inspSpeed").textContent = `${fmtNum(cph)} chars/hr`;
  document.getElementById("inspSessions").textContent = `${sessCount}`;

  const wrap = document.getElementById("inspBooksWrap");
  wrap.innerHTML = "";

  if (!dayData || dayData.booksMap.size === 0) {
    wrap.innerHTML = `<div class="day-empty-msg">No reading sessions recorded on ${dispDate}.</div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "day-books-grid";

  const booksArr = Array.from(dayData.booksMap.values()).sort((a, b) => b.chars - a.chars);
  for (const b of booksArr) {
    const bookMeta = bookLookupMap.get(b.stem);
    const gen = bookMeta ? bookMeta.generation : 1;
    const coverFile = bookMeta ? bookMeta.coverFile : "cover.jpeg";
    const coverUrl = getCoverUrl(b.stem, gen, coverFile);
    const bookCph = b.sec > 0 ? b.chars / (b.sec / 3600) : 0;
    const bookPct = bookMeta && bookMeta.totalChars > 0 ? (b.chars / bookMeta.totalChars) * 100 : 0;

    const card = document.createElement("div");
    card.className = "day-book-card";
    card.innerHTML = `
      <img class="day-book-thumb" src="${coverUrl}" alt="${b.title}" loading="lazy" onerror="this.style.opacity='0.1'" />
      <div class="day-book-meta">
        <div class="day-book-title" title="${b.title}">${shortBookTitle(b.title)}</div>
        <div class="day-book-stats">
          <span>Read: <strong>${fmtNum(b.chars)} chars</strong></span>
          <span>Time: <strong>${formatHHMM(b.sec)}</strong></span>
          <span>Speed: <strong>${fmtNum(bookCph)} c/hr</strong></span>
          <span>Progress: <strong>${fmtDec(bookPct, 1)}%</strong></span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  }

  wrap.appendChild(grid);
}

function renderCharts() {
  drawCumulativeChart();
  drawDailyChart();
}

function drawCumulativeChart() {
  const canvas = document.getElementById("cumulativeCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  ctx.clearRect(0, 0, W, H);

  const history = stateData.dailyHistory || [];
  if (history.length === 0) return;

  const totalSessionChars = history.reduce((a, d) => a + d.chars, 0);
  const baseOffset = Math.max(0, stateData.overall.readChars - totalSessionChars);

  let running = baseOffset;
  const points = history.map((d) => {
    running += d.chars;
    return {
      ts: new Date(d.date + "T12:00:00").getTime(),
      chars: running,
      date: d.date.replace(/-/g, "."),
    };
  });

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const maxChars = Math.max(stateData.overall.readChars * 1.05, 100000);

  const padL = 52, padR = 16, padT = 14, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.strokeStyle = "#e2dde9";
  ctx.fillStyle = "#767087";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= 4; i++) {
    const val = (maxChars / 4) * i;
    const y = padT + plotH - (val / maxChars) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(`${(val / 1e6).toFixed(1)}M`, padL - 8, y + 4);
  }

  const xFor = (ts) =>
    maxTs > minTs ? padL + ((ts - minTs) / (maxTs - minTs)) * plotW : padL + plotW / 2;
  const yFor = (c) => padT + plotH - (c / maxChars) * plotH;

  ctx.beginPath();
  ctx.moveTo(xFor(points[0].ts), padT + plotH);
  for (const p of points) {
    ctx.lineTo(xFor(p.ts), yFor(p.chars));
  }
  ctx.lineTo(xFor(points[points.length - 1].ts), padT + plotH);
  ctx.closePath();
  ctx.fillStyle = "rgba(85, 53, 134, 0.12)";
  ctx.fill();

  ctx.beginPath();
  points.forEach((p, idx) => {
    if (idx === 0) ctx.moveTo(xFor(p.ts), yFor(p.chars));
    else ctx.lineTo(xFor(p.ts), yFor(p.chars));
  });
  ctx.strokeStyle = "#553586";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#433e52";
  ctx.textAlign = "left";
  ctx.fillText(points[0].date, padL, H - 6);
  ctx.textAlign = "right";
  ctx.fillText(points[points.length - 1].date, W - padR, H - 6);
}

function drawDailyChart() {
  const canvas = document.getElementById("dailyCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  ctx.clearRect(0, 0, W, H);

  const historyMap = new Map(
    (stateData.dailyHistory || []).map((d) => [d.date, d])
  );

  const nowMs = stateData.generatedAt || Date.now();
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(nowMs - i * 86400 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const key = `${yyyy}-${mm}-${dd}`;
    const entry = historyMap.get(key) || { date: key, chars: 0 };
    days.push(entry);
  }

  const maxChars = Math.max(...days.map((d) => d.chars), 40000);
  const avgChars = days.reduce((a, d) => a + d.chars, 0) / days.length;

  const padL = 46, padR = 14, padT = 14, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.strokeStyle = "#e2dde9";
  ctx.fillStyle = "#767087";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "right";

  for (let i = 0; i <= 3; i++) {
    const val = (maxChars / 3) * i;
    const y = padT + plotH - (val / maxChars) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(val / 1000)}k`, padL - 6, y + 4);
  }

  const barGap = 3;
  const barW = Math.max(4, (plotW - barGap * (days.length - 1)) / days.length);

  days.forEach((d, idx) => {
    const x = padL + idx * (barW + barGap);
    const barH = (d.chars / maxChars) * plotH;
    const y = padT + plotH - barH;

    ctx.fillStyle = d.chars >= avgChars ? "#553586" : "#a393bf";
    ctx.fillRect(x, y, barW, Math.max(1, barH));
  });

  if (avgChars > 0) {
    const avgY = padT + plotH - (avgChars / maxChars) * plotH;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "#a81c35";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padL, avgY);
    ctx.lineTo(W - padR, avgY);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "#433e52";
  ctx.textAlign = "left";
  ctx.fillText(days[0].date.slice(5).replace("-", "."), padL, H - 6);
  ctx.textAlign = "right";
  ctx.fillText(days[days.length - 1].date.slice(5).replace("-", "."), W - padR, H - 6);
}

function renderBookshelf() {
  const grid = document.getElementById("booksGrid");
  grid.innerHTML = "";

  let books = stateData.series.flatMap((s) => s.books);
  if (activeSeriesFilter !== "all") {
    books = books.filter((b) => b.series === activeSeriesFilter);
  }
  if (activeStatusFilter !== "all") {
    if (activeStatusFilter === "milestone") {
      books = books.filter((b) => milestoneStems.has(b.stem));
    } else {
      books = books.filter((b) => b.status === activeStatusFilter);
    }
  }

  document.getElementById("bookshelfCount").textContent = `(${books.length})`;

  for (const b of books) {
    const inMilestone = milestoneStems.has(b.stem);
    const item = document.createElement("div");
    item.className = `volume-item status-${b.status}`;

    const coverUrl = getCoverUrl(b.stem, b.generation, b.coverFile);
    const ribbonText =
      b.status === "completed"
        ? "COMPLETED"
        : b.status === "in_progress"
        ? `READING ${fmtDec(b.progressPct, 0)}%`
        : "UNREAD";

    item.innerHTML = `
      <div class="volume-cover-wrap">
        <img src="${coverUrl}" alt="${b.title}" loading="lazy" onerror="this.style.opacity='0.1'" />
        <span class="vol-ribbon ${b.status}">${ribbonText}</span>
      </div>
      <div class="volume-body">
        <div class="volume-title" title="${b.title}">${shortBookTitle(b.title)}</div>
        <div class="sharp-bar" style="height:6px;">
          <div class="sharp-bar-fill ${b.status === "in_progress" ? "crimson-fill" : ""}" style="width:${Math.min(100, b.progressPct)}%"></div>
        </div>
        <div class="volume-chars">
          <span>${fmtNum(b.readChars)} / ${fmtNum(b.totalChars)}</span>
          <span>${b.readingTimeSec > 0 ? formatHHMM(b.readingTimeSec) : ""}</span>
        </div>
        <div class="volume-actions">
          <button class="vol-btn ${inMilestone ? "in-queue" : ""}">
            ${inMilestone ? "◆ IN CHECKLIST" : "+ CHECKLIST"}
          </button>
        </div>
      </div>
    `;

    item.querySelector(".vol-btn").onclick = () => toggleMilestoneStem(b.stem);
    grid.appendChild(item);
  }
}

function updateFilterButtons() {
  document.querySelectorAll("#seriesFilterGroup .strip-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.series === activeSeriesFilter);
  });
  document.querySelectorAll("#statusFilterGroup .strip-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.status === activeStatusFilter);
  });
}

function renderAll() {
  if (!stateData) return;
  buildDailyDetailsMap();
  const pace = computePaceStats();
  renderOverview(pace);
  renderSeriesTable(pace);
  renderMilestone(pace);
  renderHeatmap();
  renderCharts();
  renderSeriesFilterStrip();
  renderBookshelf();
}

async function fetchData() {
  const btn = document.getElementById("refreshBtn");
  btn.textContent = "LOADING...";
  try {
    stateData = await window.__TAURI__.core.invoke("get_rezero_data");
    if (stateData.checklist) {
      milestoneName = stateData.checklist.name || "Road to Volume 21";
      document.getElementById("milestoneNameInput").value = milestoneName;
      milestoneStems = new Set(stateData.checklist.stems || []);
    }
    renderAll();
  } catch (e) {
    console.error("Error loading data:", e);
  } finally {
    btn.textContent = "RELOAD";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("paceWindow").addEventListener("change", (e) => {
    selectedPaceWindow = e.target.value;
    renderAll();
  });

  document.getElementById("refreshBtn").addEventListener("click", fetchData);

  document.getElementById("milestoneNameInput").addEventListener("change", (e) => {
    milestoneName = e.target.value.trim() || "Road to Volume 21";
    saveChecklist();
  });

  document.querySelectorAll("#seriesFilterGroup .strip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSeriesFilter = btn.dataset.series;
      updateFilterButtons();
      renderBookshelf();
    });
  });

  document.querySelectorAll("#statusFilterGroup .strip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeStatusFilter = btn.dataset.status;
      updateFilterButtons();
      renderBookshelf();
    });
  });

  window.addEventListener("resize", () => {
    if (stateData) renderCharts();
  });

  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen("state-updated", () => {
      fetchData();
    });
  }

  fetchData();
});
