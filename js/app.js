/* 골프 라운드 분석 웹앱 — 화면 렌더링.
 * 데이터 원본은 GitHub 저장소의 data/rounds.json, data/settings.json 이다(GitHubStore).
 * 입력 중인 라운드만 이 브라우저에 임시 저장해, 저장 전에 화면이 닫혀도 잃지 않게 한다.
 */
(() => {
  const S = GolfStats;
  const G = GitHubStore;
  const KEY_DRAFT = "mygolf.draft.v1";
  const KEY_CACHE = "mygolf.cache.v1";
  const KEY_FILTER = "mygolf.filter.v1";
  const app = document.getElementById("app");
  let rounds = [];
  let settings = structuredClone(S.DEFAULT_SETTINGS);
  let source = "";
  let loadedAt = null;
  let charts = [];

  // ───────────── 유틸 ─────────────
  const isNum = S.isNum;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const f1 = (v) => (isNum(v) ? v.toFixed(1) : "-");
  const f2 = (v) => (isNum(v) ? v.toFixed(2) : "-");
  const pct = (v) => (isNum(v) ? Math.round(v * 100) + "%" : "-");
  const sgn = (v, d = 2) => (isNum(v) ? (v > 0 ? "+" : "") + v.toFixed(d) : "-");
  const fmtT = (v, t) => (t === "%" ? pct(v) : f1(v));
  const dot = (d) => String(d || "").replaceAll("-", ".");
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 공간 없음 */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
  };
  function toast(msg, ms = 2800) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  function chart(id, cfg) {
    const el = document.getElementById(id);
    if (el && window.Chart) charts.push(new Chart(el, cfg));
  }
  // 차트 데이터 레이블: 값만 표시 (계열·항목 이름 없음)
  const valueLabels = (fmt) => ({
    id: "valueLabels",
    afterDatasetsDraw(c) {
      const { ctx } = c;
      ctx.save();
      ctx.font = "600 11px Pretendard, sans-serif";
      ctx.fillStyle = "#333";
      ctx.textAlign = "center";
      c.data.datasets.forEach((ds, i) => {
        if (ds.noLabels) return;
        const meta = c.getDatasetMeta(i);
        if (meta.hidden) return;
        meta.data.forEach((el, j) => {
          const v = ds.data[j];
          if (!isNum(v)) return;
          const hz = c.options.indexAxis === "y";
          ctx.fillText(fmt(v), hz ? el.x + 18 : el.x, hz ? el.y + 4 : el.y - 6);
        });
      });
      ctx.restore();
    },
  });
  const baseOpts = (extra = {}) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, ...extra });
  const legendOn = { legend: { display: true, position: "bottom" } };
  const noGrid = { grid: { display: false } };

  // ───────────── 데이터 ─────────────
  async function loadAll(quiet) {
    try {
      const r = await G.load();
      if (Array.isArray(r.data)) {
        rounds = r.data;
        source = r.missing ? "pages" : r.source;
        loadedAt = new Date();
        ls.set(KEY_CACHE, rounds);
      }
      const s = await G.load("data/settings.json");
      if (s.data) settings = deepMerge(structuredClone(S.DEFAULT_SETTINGS), s.data);
      if (!quiet) toast(source === "github" ? "GitHub 최신 데이터를 불러왔습니다." : "배포본 데이터를 불러왔습니다(GitHub API 한도 초과 등).");
    } catch (e) {
      const cached = ls.get(KEY_CACHE);
      if (Array.isArray(cached)) { rounds = cached; source = "cache"; }
      toast("데이터를 불러오지 못했습니다: " + e.message, 5000);
    }
    renderStatus();
  }
  function deepMerge(a, b) {
    for (const k of Object.keys(b || {})) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) a[k] = deepMerge(a[k] || {}, b[k]);
      else a[k] = b[k];
    }
    return a;
  }
  function renderStatus() {
    const el = document.getElementById("status");
    if (!el) return;
    const src = { github: "GitHub 최신본", pages: "배포본(최대 몇 분 늦을 수 있음)", cache: "이 기기 캐시(오프라인)" }[source] || "-";
    el.innerHTML = `${G.pending() ? `<a class="ng" href="#/settings" style="color:#ffd2cc;font-weight:700">⚠ 동기화 필요</a>` : ""}<span>데이터: ${src}${loadedAt ? " · " + loadedAt.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
      <span class="${G.canWrite() ? "ok" : "muted"}">${G.canWrite() ? "● 저장 가능" : "○ 읽기 전용"}</span>
      <button class="link" id="bReload" type="button">새로고침</button>
      <a class="ver" href="#/settings" title="버전 · 변경 내역">v${APP_VERSION}</a>`;
    document.getElementById("bReload").onclick = async () => { await loadAll(); route(); };
  }
  async function commit(mutate, message) {
    const { data: next, mirrorErrors } = await G.update((data) => mutate(Array.isArray(data) ? data : []), message);
    if (mirrorErrors.length) setTimeout(() => toast("저장은 됐지만 다른 저장소 동기화에 실패했습니다. 설정 → 동기화에서 다시 맞춰 주세요.\n" + mirrorErrors.join("\n"), 8000), 3000);
    rounds = next;
    source = "github";
    loadedAt = new Date();
    ls.set(KEY_CACHE, rounds);
    renderStatus();
  }

  // ───────────── 공통 필터 (모든 분석 화면에 같은 조건) ─────────────
  let F = { period: "all", course: "", full: false, ...(ls.get(KEY_FILTER) || {}) };
  const iso = (d) => d.toISOString().slice(0, 10);
  function inPeriod(date) {
    const t = new Date(), p = F.period;
    if (p === "all") return true;
    if (p === "d90") return date >= iso(new Date(t - 90 * 864e5));
    if (p === "month") return date.startsWith(iso(t).slice(0, 7));
    if (p === "lastMonth") { const m = new Date(t.getFullYear(), t.getMonth() - 1, 15); return date.startsWith(iso(m).slice(0, 7)); }
    if (p.startsWith("y")) return date.startsWith(p.slice(1));
    return true;
  }
  function frounds() {
    return rounds.filter((r) => inPeriod(r.date || "") && (!F.course || String(r.course).includes(F.course)) && (!F.full || S.round(r).full));
  }
  const PERIOD_LABEL = { all: "전체", d90: "최근 90일", month: "이번 달", lastMonth: "지난 달" };
  function filterBar() {
    const years = [...new Set(rounds.map((r) => String(r.date).slice(0, 4)))].sort().reverse();
    const opts = [...Object.entries(PERIOD_LABEL), ...years.map((y) => ["y" + y, y + "년"])];
    const n = frounds().length;
    return `<div class="fbar" id="fbar">
      <div class="chips">${opts.map(([v, l]) => `<button type="button" class="chip ${F.period === v ? "on" : ""}" data-p="${v}">${l}</button>`).join("")}</div>
      <div class="row">
        <input id="fCourseQ" placeholder="골프장 검색" value="${esc(F.course)}" list="fCourseList">
        <datalist id="fCourseList">${[...new Set(rounds.map((r) => r.course))].sort().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <label class="row" style="gap:4px;font-size:14px"><input type="checkbox" id="fFull" ${F.full ? "checked" : ""}> 18홀만</label>
        <span class="muted">${n}라운드${F.period !== "all" || F.course || F.full ? ` · <button class="link" id="fReset" type="button">조건 초기화</button>` : ""}</span>
      </div></div>`;
  }
  function bindFilter() {
    const bar = document.getElementById("fbar");
    if (!bar) return;
    const save = () => { ls.set(KEY_FILTER, F); route(); };
    bar.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { F.period = b.dataset.p; save(); }));
    const q = document.getElementById("fCourseQ");
    q.onchange = () => { F.course = q.value.trim(); save(); };
    document.getElementById("fFull").onchange = (e) => { F.full = e.target.checked; save(); };
    const rs = document.getElementById("fReset");
    if (rs) rs.onclick = () => { F = { period: "all", course: "", full: false }; save(); };
  }
  // 각 탭 위에 무엇을 기준으로 집계했는지 짧게 적는다
  const DESC = {
    dashboard: ["위 조건에 맞는 라운드로 실력 진단·육각형·타수 손실을 계산합니다.", "타수 지표는 18홀 라운드, 퍼트·GIR·FW·스크램블·벌타는 퍼트를 기록한 라운드 기준입니다."],
    rounds: ["라운드를 누르면 스코어카드가 열립니다. 골프장 검색·기간으로 좁혀 볼 수 있습니다."],
    stats: ["스코어 유형 카드를 누르면 그 스코어가 나온 라운드가 아래에 나옵니다.", "추이 그래프는 기간이 1년 이하면 월별, 3년 이하면 분기별, 그 이상은 연도별로 묶습니다. 연도를 고르면 그해를 월별로 봅니다.", "골프장 이름을 누르면 그 골프장 라운드만 걸러 봅니다."],
    insights: ["라운드 날짜·시간으로 만든 요약입니다. 오전/오후는 티오프 시간이 있는 라운드(스마트스코어 붙여넣기 등)만 집계합니다."],
    holes: ["Par가 기록된 홀만 집계합니다."],
    detail: ["v2 「상세분석」 7개 블록에 ⑧ 홀 길이별(실제로 친 티 거리) 분석을 더했습니다. 상세 항목을 기록한 홀만 각 표에 들어갑니다."],
  };
  const desc = (k) => (DESC[k] ? `<ul class="desc">${DESC[k].map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  const head = (k) => filterBar() + desc(k);

  // ───────────── 라우팅 ─────────────
  function route() {
    charts.forEach((c) => c.destroy());
    charts = [];
    const [, tab = "dashboard", arg] = location.hash.split("?")[0].split("/");
    const active = tab === "round" || tab === "edit" ? "rounds" : tab;
    document.querySelectorAll("#tabs a").forEach((a) => a.classList.toggle("active", a.dataset.tab === active));
    const views = { dashboard, input: () => inputView(null), edit: () => inputView(decodeURIComponent(arg || "")), rounds: roundsView, round: () => roundView(decodeURIComponent(arg || "")), stats: statsView, insights: insightsView, holes: holesView, detail: detailView, import: importView, guide: guideView, settings: settingsView };
    (views[tab] || dashboard)();
    bindFilter();
    window.scrollTo(0, 0);
  }

  // ───────────── 대시보드 ─────────────
  function kpi(lbl, val, sub, cls = "") {
    return `<div class="kpi"><div class="lbl">${lbl}</div><div class="val ${cls}">${val}</div><div class="sub">${sub || "&nbsp;"}</div></div>`;
  }
  // 목표 달성 여부: 낮을수록 좋은 지표(타수·퍼트·벌타 등)는 목표 이하, 높을수록 좋은 지표(파 이하 홀·GIR 등)는 목표 이상이면 달성
  const meets = (v, t) => (isNum(v) ? (t.low ? v <= t.v : v >= t.v) : null);
  const judge = (ok) => (ok === null ? "-" : `<span class="pill ${ok ? "ok" : "ng"}">${ok ? "달성" : "미달"}</span>`);
  const valCell = (v, t, ok, strong) => `<td class="${ok === null ? "" : ok ? "ok" : "ng"}">${strong ? "<b>" : ""}${fmtT(v, t.fmt)}${strong ? "</b>" : ""}</td>`;
  const goalText = (t) => `${fmtT(t.v, t.fmt)} ${t.low ? "이하" : "이상"}`;

  function dashboard() {
    const fr = frounds();
    const A = S.analyze(fr, settings);
    const rows = Object.entries(settings.targets).map(([k, t]) => {
      const m = A.metric(k);
      return { t, m, ok: meets(m.r5, t), okLast: meets(m.last, t) };
    });
    const okList = rows.filter((r) => r.ok === true).map((r) => r.t.label);
    const ngList = rows.filter((r) => r.ok === false).map((r) => r.t.label);
    const lossTop = A.loss.filter((l) => isNum(l.r5)).sort((a, b) => b.r5 - a.r5)[0];
    const H = S.holeLevel(fr);
    const ps = [3, 4, 5].filter((p) => isNum(H.byPar[p].over)).sort((a, b) => H.byPar[a].over - H.byPar[b].over);
    const frA = S.avg(A.fulls.map((r) => r.front)), bk = S.avg(A.fulls.map((r) => r.back));
    app.innerHTML = `
      ${head("dashboard")}
      <h2>요약</h2>
      <div class="kpis">
        ${kpi("등록 라운드", A.rs.length, `18홀 ${A.fulls.length}회`)}
        ${kpi("베스트 스코어", A.best ? A.best.strokes : "-", A.best ? `${dot(A.best.date)} ${esc(A.best.course)}` : "", "best")}
        ${kpi("평균 타수", f1(S.avg(A.fulls.map((r) => r.strokes))), "18홀 평균")}
        ${kpi("최근 5R 평균", f1(S.avg(A.fulls.slice(0, 5).map((r) => r.strokes))), "최근 18홀 5라운드")}
        ${kpi("방문 골프장", A.courses, "서로 다른 골프장")}
      </div>
      <h2>실력 진단 <span class="muted">최근 5라운드 vs 목표</span></h2>
      <div class="tbl-wrap"><table>
        <thead><tr><th class="l">지표</th><th>목표</th><th>전체 평균</th><th>최근 5R</th><th>판정<br><span class="muted">최근 5R</span></th><th>직전 라운드</th><th>판정<br><span class="muted">직전</span></th></tr></thead>
        <tbody>${rows.map(({ t, m, ok, okLast }) => `<tr><td class="l"><b>${t.label}</b><br><span class="muted">${t.low ? "▼ 낮을수록 좋음" : "▲ 높을수록 좋음"}</span></td><td><b>${goalText(t)}</b></td><td class="muted">${fmtT(m.all, t.fmt)}</td>${valCell(m.r5, t, ok, true)}<td>${judge(ok)}</td>${valCell(m.last, t, okLast, false)}<td>${judge(okLast)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="legend-note">판정: 「이상」 지표는 값이 목표와 같거나 크면, 「이하」 지표는 목표와 같거나 작으면 달성입니다. 최근 5R과 직전 라운드를 각각 판정하고, 강점·약점은 최근 5R 판정을 씁니다. 타수 지표는 18홀 라운드(${A.fulls.length}회), 퍼트/GIR/FW/스크램블/벌타는 퍼트를 기록한 상세 라운드(${A.dets.length}회) 기준입니다.</p>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3 class="mt0">6영역 육각형 <span class="muted">최근 상세 5R vs 전체</span></h3><div class="chart-box tall"><canvas id="cRadar"></canvas></div></div>
        <div class="card"><h3 class="mt0">라운드당 타수 손실 <span class="muted">최근 상세 5R</span></h3><div class="chart-box tall"><canvas id="cLoss"></canvas></div>
          <p class="legend-note">항목끼리 일부 겹칩니다(벌타 홀은 더블+가 되기 쉬움). 크기 비교로 연습 순서를 정하는 용도입니다.</p></div>
      </div>
      <h2>강점 · 약점</h2>
      <div class="card"><ul class="sw">
        <li><span class="ok">강점</span> ${okList.length ? "목표 달성: " + okList.join(", ") : "목표를 달성한 지표가 아직 없습니다"}</li>
        <li><span class="ng">약점</span> ${ngList.length ? "목표 미달: " + ngList.join(", ") : "모든 지표가 목표를 달성했습니다"}</li>
        ${lossTop ? `<li><span class="ng">1순위</span> 가장 많이 잃는 곳: ${lossTop.label} (최근 5R 라운드당 ${f1(lossTop.r5)}타)</li>` : ""}
        ${ps.length ? `<li><b>파 유형</b> 파${ps[0]} 가장 안정(${sgn(H.byPar[ps[0]].over)}) / 파${ps.at(-1)} 가장 약함(${sgn(H.byPar[ps.at(-1)].over)}, 더블+ ${pct(H.byPar[ps.at(-1)].dbl)})</li>` : ""}
        ${A.tee.L + A.tee.R ? `<li><b>티샷 미스</b> 왼쪽(L·H) ${A.tee.L}회 / 오른쪽(R·S) ${A.tee.R}회${A.tee.R >= 2 * A.tee.L ? " → 오른쪽 쏠림(슬라이스 계열) 점검" : A.tee.L >= 2 * A.tee.R ? " → 왼쪽 쏠림(훅 계열) 점검" : ""}</li>` : ""}
        ${isNum(frA) ? `<li><b>전·후반</b> 전반 평균 ${f1(frA)} / 후반 평균 ${f1(bk)}</li>` : ""}
      </ul></div>
      <h2>타수 추이 <span class="muted">최근 18홀 30라운드</span></h2>
      <div class="card"><div class="chart-box tall"><canvas id="cTrend"></canvas></div></div>`;
    const rk = Object.keys(settings.radar);
    chart("cRadar", {
      type: "radar",
      data: {
        labels: rk.map((k) => settings.radar[k].label),
        datasets: [
          { label: "최근 5R", data: rk.map((k) => A.radar.score[k]), backgroundColor: "rgba(30,94,59,.25)", borderColor: "#1e5e3b", pointBackgroundColor: "#1e5e3b" },
          { label: "전체 평균", data: rk.map((k) => A.radarAll.score[k]), borderColor: "#1f6fd6", backgroundColor: "transparent", pointRadius: 2 },
          { label: "목표", data: rk.map(() => settings.radarTarget), borderColor: "#f28c28", borderDash: [6, 4], backgroundColor: "transparent", pointRadius: 0 },
        ],
      },
      options: baseOpts({ plugins: legendOn, scales: { r: { min: 0, max: 100, ticks: { stepSize: 20, display: false }, pointLabels: { font: { size: 13, weight: "600" } } } } }),
      plugins: [{
        id: "radarVals",
        afterDatasetsDraw(c) {
          const meta = c.getDatasetMeta(0), ctx = c.ctx;
          ctx.save(); ctx.font = "700 12px Pretendard, sans-serif"; ctx.fillStyle = "#1e5e3b"; ctx.textAlign = "center";
          meta.data.forEach((p, i) => { const v = c.data.datasets[0].data[i]; if (isNum(v)) ctx.fillText(v, p.x, p.y - 8); });
          ctx.restore();
        },
      }],
    });
    chart("cLoss", {
      type: "bar",
      data: { labels: A.loss.map((l) => l.label), datasets: [{ data: A.loss.map((l) => l.r5), backgroundColor: "#e5352b" }] },
      options: baseOpts({ indexAxis: "y", scales: { x: { beginAtZero: true, ...noGrid }, y: noGrid } }),
      plugins: [valueLabels(f1)],
    });
    const list = A.fulls.slice(0, 30).reverse(), all = A.fulls.slice().reverse();
    chart("cTrend", {
      type: "line",
      data: {
        labels: list.map((r) => r.date.slice(2).replaceAll("-", ".")),
        datasets: [
          { label: "총타수", data: list.map((r) => r.strokes), borderColor: "#e5352b", backgroundColor: "#e5352b", borderDash: [6, 4], pointRadius: 4, tension: 0 },
          { label: "5R 이동평균", data: list.map((r) => { const i = all.indexOf(r); return S.avg(all.slice(Math.max(0, i - 4), i + 1).map((x) => x.strokes)); }), borderColor: "#1f6fd6", pointRadius: 0, tension: 0.2, noLabels: true },
        ],
      },
      options: baseOpts({ plugins: legendOn, scales: { y: { suggestedMin: 75, suggestedMax: 110 }, x: noGrid } }),
      plugins: [valueLabels((v) => v)],
    });
  }

  // ───────────── 라운드 입력 (v2 스코어카드 전 항목) ─────────────
  // [키, 라벨, 종류, 옵션]
  const FIELDS = [
    ["기본", [["par", "Par", "sel", [3, 4, 5, 6]], ["score", "Score (+/-)", "sel", [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8]], ["putts", "Putts", "sel", [0, 1, 2, 3, 4, 5]], ["pen", "벌타", "sel", [0, 1, 2, 3, 4]]]],
    ["코스 정보", [["dist", "거리 (m)", "num"], ["hcp", "핸디캡", "sel", Array.from({ length: 18 }, (_, i) => i + 1)]]],
    ["티샷", [["fw", "FW 안착", "ox"], ["miss", "티샷 미스", "sel", ["L", "R", "H", "S", "-"]], ["drive", "티샷 거리 (m)", "num"]]],
    ["그린", [["ong", "온그린 타수", "sel", [1, 2, 3, 4, 5, 6, 7, 8]], ["gir", "GIR 직접", "ox"], ["fp", "1st 퍼트 거리 (m)", "num"]]],
    ["숏게임", [["gmiss", "그린 미스", "sel", ["짧음", "길음", "좌", "우", "-"]], ["appr", "어프로치 거리 (m)", "num"], ["bunker", "벙커샷 수", "sel", [0, 1, 2, 3, 4]], ["sg", "숏게임 성공", "ox"]]],
    ["메모", [["memo", "메모", "text"]]],
  ];
  const FLAT = FIELDS.flatMap(([, fs]) => fs);
  const TEXT_KEYS = new Set(["miss", "gmiss", "memo"]);
  const HINT = {
    dist: "실제로 친 티 기준(m)",
    score: "파=0, 보기=1, 더블=2, 버디=-1", fw: "파4·파5만", miss: "L 왼쪽 / R 오른쪽 / H 훅 / S 슬라이스 / - 없음",
    ong: "그린에 올라가기까지 친 타수(벌타 포함)", gir: "비우면 온그린 타수로 자동 판정", sg: "어프로치가 의도대로 됐으면 ○",
    gmiss: "그린을 놓친 방향", appr: "그린을 놓쳤을 때 핀까지 남은 거리",
  };

  function inputView(id) {
    const edit = id ? rounds.find((r) => r.id === id) : null;
    if (id && !edit) { app.innerHTML = `<p>라운드를 찾을 수 없습니다. <a href="#/rounds">목록으로</a></p>`; return; }
    const draftKey = KEY_DRAFT + (edit ? ":" + edit.id : ":new");
    const draft = ls.get(draftKey);
    const base = edit ? structuredClone(edit) : { date: new Date().toISOString().slice(0, 10), course: "", front: "", back: "", tee: "White", memo: "", holes: [] };
    let r = draft && draft.holes ? draft : base;
    const H = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [i + 1, { h: i + 1 }]));
    (r.holes || []).forEach((h) => (H[h.h] = { ...h }));
    let cur = 1;
    const courses = [...new Set(rounds.map((x) => x.course))].sort();
    const tees = [...new Set(["White", "Blue", "Black", "Red", "Gold", ...rounds.map((x) => x.tee).filter(Boolean)])];

    app.innerHTML = `
      <h2>${edit ? "라운드 수정" : "라운드 입력"}</h2>
      ${G.canWrite() ? "" : `<div class="notice">지금은 <b>읽기 전용</b>입니다. 저장하려면 <a href="#/settings">설정</a>에서 GitHub 토큰을 넣어 주세요. 입력 내용은 이 기기에 임시 저장됩니다.</div>`}
      ${draft ? `<div class="notice" style="margin-top:8px">이전에 입력하던 내용을 불러왔습니다. <button class="link" id="bDiscard" type="button">버리고 새로 시작</button></div>` : ""}
      <div class="card" style="margin-top:12px">
        <div class="form">
          <label class="f">날짜<input id="fDate" type="date" value="${esc(r.date)}"></label>
          <label class="f">골프장<input id="fCourse" list="courseList" value="${esc(r.course)}" placeholder="예: 기흥CC"></label>
          <label class="f">전반 코스<input id="fFront" value="${esc(r.front)}" placeholder="예: NORTH"></label>
          <label class="f">후반 코스<input id="fBack" value="${esc(r.back)}" placeholder="예: WEST"></label>
          <label class="f">티<input id="fTee" list="teeList" value="${esc(r.tee || "")}"></label>
          <label class="f">날씨·컨디션·메모<input id="fMemo" value="${esc(r.memo)}"></label>
        </div>
        <datalist id="courseList">${courses.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <datalist id="teeList">${tees.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <div class="row" style="margin-top:10px"><button class="btn ghost" id="bCourse" type="button">이전 라운드 코스 정보 불러오기 (Par·거리·핸디캡)</button></div>
      </div>

      <div class="holenav" id="holeNav"></div>
      <div class="card holecard" id="holeCard"></div>
      <div class="row" style="margin-top:10px;justify-content:space-between">
        <button class="btn ghost" id="bPrev" type="button">◀ 이전 홀</button>
        <button class="btn ghost" id="bNext" type="button">다음 홀 ▶</button>
      </div>

      <h3>스코어카드 미리보기</h3>
      <div id="preview"></div>
      <div class="totals" id="totals"></div>
      <div class="row" style="margin-top:14px">
        <button class="btn" id="bSave" type="button" ${G.canWrite() ? "" : "disabled"}>GitHub에 저장</button>
        <a class="btn ghost" href="${edit ? "#/round/" + encodeURIComponent(edit.id) : "#/rounds"}">취소</a>
      </div>
      <p class="legend-note">중간에 저장해도 됩니다. 나중에 「수정」으로 이어서 입력할 수 있습니다.</p>`;

    const $ = (s) => document.getElementById(s);
    const meta = () => ({ date: $("fDate").value, course: $("fCourse").value.trim(), front: $("fFront").value.trim(), back: $("fBack").value.trim(), tee: $("fTee").value.trim(), memo: $("fMemo").value.trim() });
    const holesArr = () => Object.values(H).map((h) => Object.fromEntries(Object.entries(h).filter(([, v]) => v !== "" && v !== null && v !== undefined))).filter((h) => Object.keys(h).length > 1);
    const saveDraft = () => ls.set(draftKey, { ...meta(), id: edit?.id, holes: holesArr() });

    function field([k, lab, type, opts]) {
      const v = H[cur][k];
      const dis = k === "fw" && H[cur].par === 3 ? "disabled" : "";
      let ctl;
      if (type === "sel") ctl = `<select data-k="${k}" ${dis}><option value=""></option>${opts.map((o) => `<option value="${o}" ${String(v) === String(o) ? "selected" : ""}>${typeof o === "number" && o > 0 && k === "score" ? "+" + o : o}</option>`).join("")}</select>`;
      else if (type === "ox") ctl = `<select data-k="${k}" ${dis}><option value=""></option><option value="1" ${v === 1 ? "selected" : ""}>○</option><option value="0" ${v === 0 ? "selected" : ""}>×</option></select>`;
      else if (type === "num") ctl = `<input data-k="${k}" type="number" inputmode="decimal" step="0.5" min="0" value="${v ?? ""}">`;
      else ctl = `<input data-k="${k}" value="${esc(v ?? "")}">`;
      return `<label class="f ${k === "score" ? "key" : ""} ${k === "memo" ? "wide" : ""}">${lab}${ctl}${HINT[k] ? `<span class="hint">${HINT[k]}</span>` : ""}</label>`;
    }
    function drawCard() {
      const h = H[cur];
      const gir = S.holeGir(h);
      $("holeCard").innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:baseline">
          <div class="hc-title">${cur}번 홀 <span class="muted">${cur <= 9 ? "전반" : "후반"}</span></div>
          <div class="muted">${isNum(h.par) && isNum(h.score) ? `타수 <b>${h.par + h.score}</b>` : ""} ${gir === null ? "" : `· GIR ${gir ? "○" : "×"}`} ${S.holeCheck(h) ? `<span class="ng"> · 온그린+퍼트 ≠ 타수</span>` : ""}</div>
        </div>
        ${(() => {
          const p = Clubs.plan(h.par, h.dist, Clubs.bag(settings));
          if (p) return `<div class="plan">🏌️ <b>공략 가이드</b> <span class="muted">(추정)</span> ${p.text}</div>`;
          return isNum(h.par) ? `<div class="plan muted">거리를 넣으면 내 클럽 거리로 공략 가이드가 나옵니다</div>` : "";
        })()}
        ${FIELDS.map(([g, fs]) => `<div class="fgroup"><div class="fg-title">${g}</div><div class="form">${fs.map(field).join("")}</div></div>`).join("")}`;
      $("holeCard").querySelectorAll("[data-k]").forEach((el) => {
        el.addEventListener("change", () => {
          const k = el.dataset.k;
          const raw = el.value;
          H[cur][k] = raw === "" ? undefined : TEXT_KEYS.has(k) ? raw.trim() : k === "dist" || k === "drive" ? Math.round(Number(raw)) : Number(raw);
          if (k === "par" && H[cur].par === 3) H[cur].fw = undefined;
          saveDraft();
          drawAll(k === "par");
        });
      });
    }
    function drawNav() {
      $("holeNav").innerHTML = Array.from({ length: 18 }, (_, i) => {
        const h = H[i + 1];
        const s = h.score;
        const cls = isNum(s) ? (s <= -1 ? "sc-m2" : s === 0 ? "sc-0" : s === 1 ? "sc-1" : s === 2 ? "sc-2" : "sc-3") : "";
        return `<button type="button" class="hn-btn ${cls} ${i + 1 === cur ? "cur" : ""}" data-h="${i + 1}"><span>${i + 1}</span><small>${isNum(s) ? (s > 0 ? "+" + s : s) : "·"}</small></button>`;
      }).join("");
      $("holeNav").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { cur = Number(b.dataset.h); drawAll(true); }));
    }
    function drawPreview() {
      $("preview").innerHTML = scorecard({ holes: holesArr() }, true);
      const st = S.round({ date: meta().date, holes: holesArr() });
      $("totals").innerHTML = `<span>입력 홀 <b>${st.holes}</b></span><span>총타수 <b>${st.strokes ?? "-"}</b></span><span>오버 <b>${sgn(st.over, 0)}</b></span>
        ${st.detail ? `<span>퍼트 <b>${st.putts}</b></span><span>GIR <b>${st.gir}</b></span><span>3퍼트 <b>${st.p3}</b></span>` : ""}<span>더블+ <b>${st.dbl}</b></span>
        ${st.checks.length ? `<span class="ng">기록 확인: ${st.checks.join(", ")}번 홀</span>` : ""}`;
    }
    function drawAll(card = true) { drawNav(); if (card) drawCard(); drawPreview(); }
    drawAll();
    ["fDate", "fCourse", "fFront", "fBack", "fTee", "fMemo"].forEach((x) => $(x).addEventListener("input", saveDraft));
    $("bPrev").onclick = () => { cur = cur === 1 ? 18 : cur - 1; drawAll(); };
    $("bNext").onclick = () => { cur = cur === 18 ? 1 : cur + 1; drawAll(); };
    if ($("bDiscard")) $("bDiscard").onclick = () => { ls.del(draftKey); inputView(id); };
    $("bCourse").onclick = () => {
      const m = meta();
      const prev = S.byRecent(rounds.filter((x) => x.course === m.course && x.id !== edit?.id));
      if (!prev.length) return toast("같은 골프장 이전 기록이 없습니다.");
      const norm = (t) => String(t || "").trim().toLowerCase();
      // 9홀 정보 찾기: 코스명이 전반·후반 어느 쪽에 있었든 같은 코스명의 9홀을 쓴다.
      // 코스명을 적었는데 같은 코스 기록이 없으면 다른 코스 값을 쓰지 않는다(엉뚱한 Par가 들어가지 않게).
      const nine = (list, name, front) => {
        for (const p of list) {
          if (name && p.front === name) return { p, holes: p.holes.filter((h) => h.h <= 9) };
          if (name && p.back === name) return { p, holes: p.holes.filter((h) => h.h > 9) };
        }
        if (name || !list.length) return null;
        return { p: list[0], holes: list[0].holes.filter((h) => (front ? h.h <= 9 : h.h > 9)) };
      };
      const fill = (src, start, keys) => {
        if (!src) return 0;
        let n = 0;
        src.holes.slice().sort((a, b) => a.h - b.h).forEach((h, i) => {
          const t = H[start + i];
          if (!t) return;
          for (const k of keys) if (isNum(h[k]) && !isNum(t[k])) { t[k] = h[k]; n++; }
        });
        return n;
      };
      // Par·핸디캡은 티와 상관없이 같고, 거리는 티마다 달라 '같은 티'로 친 기록에서만 가져온다
      const sameTee = prev.filter((p) => norm(p.tee) && norm(p.tee) === norm(m.tee));
      const pf = nine(prev, m.front, true), pb = nine(prev, m.back, false);
      const df = nine(sameTee, m.front, true), db = nine(sameTee, m.back, false);
      const nPar = fill(pf, 1, ["par", "hcp"]) + fill(pb, 10, ["par", "hcp"]);
      const nDist = fill(df, 1, ["dist"]) + fill(db, 10, ["dist"]);
      saveDraft();
      drawAll();
      const src = [pf, pb].filter(Boolean).map((x) => dot(x.p.date));
      toast((nPar ? `Par·핸디캡: ${[...new Set(src)].join(", ")} 기록에서 불러왔습니다.` : "같은 코스명의 이전 기록이 없어 Par·핸디캡을 채우지 못했습니다.")
        + "\n" + (nDist ? `거리: 같은 티(${m.tee})로 친 기록에서 불러왔습니다.` : `거리: ${m.tee ? `같은 티(${m.tee})로 친` : "티를 적은"} 기록이 없어 비워 두었습니다. 스코어카드의 ${m.tee || "친 티"} 거리를 넣어 주세요.`), 6000);
    };
    $("bSave").onclick = async () => {
      const m = meta();
      const hs = holesArr();
      if (!m.date || !m.course) return toast("날짜와 골프장을 입력하세요.");
      if (!hs.some((h) => isNum(h.score))) return toast("스코어를 한 홀 이상 입력하세요.");
      // 수정할 때 입력 화면에 없는 값(티오프 시간 등)은 그대로 둔다
      const obj = { ...(edit || {}), id: edit ? edit.id : "r" + m.date.replaceAll("-", "") + "-" + Date.now().toString(36), ...m, holes: hs };
      $("bSave").disabled = true;
      $("bSave").textContent = "저장 중…";
      try {
        await commit((data) => {
          const i = data.findIndex((x) => x.id === obj.id);
          if (i >= 0) data[i] = obj; else data.push(obj);
          return data.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        }, `${edit ? "라운드 수정" : "라운드 추가"}: ${m.date} ${m.course}`);
        ls.del(draftKey);
        toast("GitHub에 저장했습니다.");
        location.hash = "#/round/" + encodeURIComponent(obj.id);
      } catch (e) {
        toast(e.message, 6000);
        $("bSave").disabled = false;
        $("bSave").textContent = "GitHub에 저장";
      }
    };
  }

  // v2 「스코어카드」와 같은 행 구성
  const CARD_ROWS = [["dist", "거리 (m)", "sum"], ["hcp", "핸디캡"], ["par", "Par", "sum"], ["score", "Score (+/-)", "sum"], ["fw", "FW 안착", "fw"], ["miss", "티샷 미스"], ["drive", "티샷 거리"], ["ong", "온그린 타수"], ["gir", "GIR"], ["putts", "Putts", "sum"], ["fp", "1st 퍼트 (m)"], ["gmiss", "그린 미스"], ["appr", "어프로치 (m)"], ["bunker", "벙커샷", "sum"], ["sg", "숏게임"], ["pen", "벌타", "sum"], ["memo", "메모"]];
  function scorecard(r, compact) {
    const hm = Object.fromEntries((r.holes || []).map((h) => [h.h, h]));
    const used = new Set(r.holes.flatMap((h) => Object.keys(h)));
    used.add("par"); used.add("score"); used.add("gir");
    const rowsUsed = compact ? CARD_ROWS.filter(([k]) => used.has(k)) : CARD_ROWS;
    const cell = (h, k) => {
      const x = hm[h] || {};
      const v = x[k];
      if (k === "score" && isNum(v)) return `<td class="sc-cell ${v <= -1 ? "sc-m2" : v === 0 ? "sc-0" : v === 1 ? "sc-1" : v === 2 ? "sc-2" : "sc-3"}">${v > 0 ? "+" + v : v}</td>`;
      if (k === "gir") { const g = hm[h] ? S.holeGir(x) : null; return `<td>${g === null ? "" : g ? "○" : "×"}</td>`; }
      if (k === "fw" || k === "sg") return `<td>${v === 1 ? "○" : v === 0 ? "×" : ""}</td>`;
      if (k === "memo") return `<td class="memo">${esc(v ?? "")}</td>`;
      return `<td>${esc(v ?? "")}</td>`;
    };
    const tot = (a, k, how) => {
      const xs = Array.from({ length: 9 }, (_, i) => hm[a + i]?.[k]);
      if (how === "sum") { const n = xs.filter(isNum); return n.length ? S.sum(n) : ""; }
      if (how === "fw") { const n = xs.filter(isNum); return n.length ? `${n.filter((v) => v === 1).length}/${n.length}` : ""; }
      if (k === "gir") { const g = Array.from({ length: 9 }, (_, i) => (hm[a + i] ? S.holeGir(hm[a + i]) : null)).filter((v) => v !== null); return g.length ? `${S.sum(g)}/${g.length}` : ""; }
      return "";
    };
    const half = (a, name) => `<div class="tbl-wrap card-tbl" style="margin-top:8px"><table>
      <thead><tr><th class="l">${name}</th>${Array.from({ length: 9 }, (_, i) => `<th>${a + i}</th>`).join("")}<th>${a === 1 ? "OUT" : "IN"}</th></tr></thead>
      <tbody>${rowsUsed.map(([k, lab, how]) => `<tr><th class="l">${lab}</th>${Array.from({ length: 9 }, (_, i) => cell(a + i, k)).join("")}<td><b>${tot(a, k, how || (k === "gir" ? "gir" : ""))}</b></td></tr>`).join("")}</tbody></table></div>`;
    return half(1, "전반") + half(10, "후반");
  }

  // ───────────── 라운드 목록·상세 ─────────────
  function roundsView() {
    const list = S.byRecent(frounds());
    app.innerHTML = `${head("rounds")}
      <div class="row" style="justify-content:space-between"><h2>라운드 목록 <span class="muted">${list.length}회</span></h2><a class="btn" href="#/input">+ 새 라운드</a></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>날짜</th><th class="l">골프장</th><th>홀</th><th>총타수</th><th>오버</th><th>전반</th><th>후반</th><th>퍼트</th><th>GIR</th><th>FW</th><th>더블+</th><th>벌타</th></tr></thead>
        <tbody>${list.map((r) => {
          const s = S.round(r);
          return `<tr class="click" data-id="${esc(r.id)}"><td>${dot(r.date)}</td><td class="l">${esc(r.course)}</td><td>${s.holes}</td><td><b>${s.strokes ?? "-"}</b></td><td>${sgn(s.over, 0)}</td><td>${s.front ?? "-"}</td><td>${s.back ?? "-"}</td><td>${s.detail ? s.putts : "-"}</td><td>${s.detail ? pct(s.girp) : "-"}</td><td>${pct(s.fwp)}</td><td>${s.dbl}</td><td>${s.detail && isNum(s.pen) ? s.pen : "-"}</td></tr>`;
        }).join("")}</tbody>
      </table></div>`;
    app.querySelectorAll("tr[data-id]").forEach((tr) => tr.addEventListener("click", () => (location.hash = "#/round/" + encodeURIComponent(tr.dataset.id))));
  }
  function roundView(id) {
    const r = rounds.find((x) => x.id === id);
    if (!r) { app.innerHTML = `<p>라운드를 찾을 수 없습니다. <a href="#/rounds">목록으로</a></p>`; return; }
    const s = S.round(r);
    const rad = S.analyze([r], settings).radar.score;
    app.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <h2>${dot(r.date)} ${esc(r.course)} <span class="muted">${esc([r.front, r.back].filter(Boolean).join(" / "))}${r.tee ? " · " + esc(r.tee) : ""}</span></h2>
        <div class="row"><a class="btn ghost" href="#/edit/${encodeURIComponent(r.id)}">수정</a><button class="btn danger" id="bDel" type="button" ${G.canWrite() ? "" : "disabled"}>삭제</button></div>
      </div>
      <div class="kpis">
        ${kpi("총타수", s.strokes ?? "-", s.full ? `전반 ${s.front} / 후반 ${s.back}` : `${s.holes}홀 입력`)}
        ${kpi("오버파", sgn(s.over, 0), `버디+ ${s.birdie} / 파 ${s.parn} / 보기 ${s.bogey}`)}
        ${kpi("더블+", s.dbl, `초과타 ${s.blow}`)}
        ${s.detail ? kpi("퍼트", s.putts, `3퍼트 ${s.p3} / 1퍼트 ${s.onep}`) + kpi("GIR", pct(s.girp), `스크램블 ${pct(s.scrp)}`) + kpi("FW", pct(s.fwp), `벌타 ${s.pen ?? "-"}`) : ""}
      </div>
      ${s.checks.length ? `<div class="notice" style="margin-top:10px">기록 확인: ${s.checks.join(", ")}번 홀은 온그린 타수 + 퍼트가 타수와 다릅니다.</div>` : ""}
      ${scorecard(r, false)}
      ${r.memo ? `<p class="card" style="margin-top:12px">${esc(r.memo)}</p>` : ""}
      ${s.detail ? `<div class="card" style="margin-top:12px"><h3 class="mt0">이 라운드 6영역</h3><div class="chart-box"><canvas id="cR"></canvas></div></div>` : ""}
      <div id="delBox"></div>
      <p><a href="#/rounds">← 목록으로</a></p>`;
    if (s.detail) {
      const rk = Object.keys(settings.radar);
      chart("cR", {
        type: "radar",
        data: { labels: rk.map((k) => settings.radar[k].label), datasets: [{ data: rk.map((k) => rad[k]), backgroundColor: "rgba(30,94,59,.25)", borderColor: "#1e5e3b" }, { data: rk.map(() => settings.radarTarget), borderColor: "#f28c28", borderDash: [6, 4], backgroundColor: "transparent", pointRadius: 0 }] },
        options: baseOpts({ scales: { r: { min: 0, max: 100, ticks: { display: false } } } }),
      });
    }
    document.getElementById("bDel").onclick = () => {
      document.getElementById("delBox").innerHTML = `<div class="notice">이 라운드를 GitHub에서 삭제할까요? <button class="btn danger" id="bDel2" type="button">삭제 확인</button></div>`;
      document.getElementById("bDel2").onclick = async () => {
        try {
          await commit((data) => data.filter((x) => x.id !== id), `라운드 삭제: ${r.date} ${r.course}`);
          toast("삭제했습니다.");
          location.hash = "#/rounds";
        } catch (e) { toast(e.message, 6000); }
      };
    };
  }

  // ───────────── 통계 ─────────────
  let trendYear = "";
  function statsView() {
    const fr = frounds();
    const A = S.analyze(fr, settings);
    const ST = S.stability(A.fulls);
    const types = S.scoreTypes(fr);
    const bands = [["70대 이하", 0, 79], ["80대", 80, 89], ["90대", 90, 99], ["100 이상", 100, 999]].map(([l, a, b]) => ({ l, n: A.fulls.filter((r) => r.strokes >= a && r.strokes <= b).length }));
    const yr = [...new Set(A.rs.map((r) => r.year))].sort().map((y) => {
      const rs = A.rs.filter((r) => r.year === y), fs = rs.filter((r) => r.full);
      return { y, n: rs.length, f: fs.length, c: new Set(rs.map((r) => r.course)).size, avg: S.avg(fs.map((r) => r.strokes)), best: fs.length ? Math.min(...fs.map((r) => r.strokes)) : null, worst: fs.length ? Math.max(...fs.map((r) => r.strokes)) : null };
    });
    const top10 = A.fulls.slice().sort((a, b) => a.strokes - b.strokes || (a.date < b.date ? 1 : -1)).slice(0, 10);
    const cs = [...new Set(A.recent.map((r) => r.course))].map((c) => {
      const rs = A.recent.filter((r) => r.course === c), fs = rs.filter((r) => r.full);
      return { c, n: rs.length, avg: S.avg(fs.map((r) => r.strokes)), best: fs.length ? Math.min(...fs.map((r) => r.strokes)) : null, last: rs[0].date, lastScore: rs[0].strokes };
    }).sort((a, b) => b.n - a.n || (a.last < b.last ? 1 : -1));
    const trendSrc = trendYear ? A.rs.filter((r) => String(r.year) === trendYear) : A.rs;
    const TB = S.trendBuckets(trendSrc, !!trendYear);
    app.innerHTML = `${head("stats")}
      <h2>스코어 유형 <span class="muted">홀 단위 횟수</span></h2>
      <div class="kpis">${types.map((t) => `<button type="button" class="kpi kbtn ${t.n ? "" : "dim"}" data-st="${t.key}" ${t.n ? "" : "disabled"}><div class="lbl">${t.label}</div><div class="val ${["hio", "alb", "eagle", "birdie"].includes(t.key) ? "best" : ""}">${t.n}</div></button>`).join("")}</div>
      <div id="stList"></div>

      <h2>평균 · 안정성 <span class="muted">18홀 ${A.fulls.length}회</span></h2>
      <div class="kpis">
        ${kpi("평균 타수", f1(ST?.avg), "18홀 평균")}
        ${kpi("최근 10R 평균", f1(ST?.last10), "최근 18홀 10라운드")}
        ${kpi("표준편차", isNum(ST?.sd) ? "±" + ST.sd.toFixed(1) : "-", "작을수록 점수가 안정적")}
        ${kpi("최저 · 최고", ST ? `${ST.min} · ${ST.max}` : "-", "베스트 · 워스트")}
      </div>

      <h2>타수 추이 <span class="muted">${TB.unit}별</span></h2>
      <div class="chips" style="margin-bottom:8px"><button type="button" class="chip ${trendYear ? "" : "on"}" data-ty="">자동</button>${yr.map((r) => `<button type="button" class="chip ${trendYear === String(r.y) ? "on" : ""}" data-ty="${r.y}">${r.y}</button>`).join("")}</div>
      <div class="card"><div class="chart-box tall"><canvas id="cTB"></canvas></div></div>

      <h2>베스트 스코어 TOP 10</h2>
      <div class="tbl-wrap"><table><thead><tr><th>순위</th><th>날짜</th><th class="l">골프장</th><th>타수</th><th>전반</th><th>후반</th></tr></thead>
        <tbody>${top10.map((r, i) => `<tr class="click" data-id="${esc(r.id)}"><td><b>${i + 1}</b></td><td>${dot(r.date)}</td><td class="l">${esc(r.course)}</td><td class="${i === 0 ? "ng" : ""}"><b>${r.strokes}</b></td><td>${r.front}</td><td>${r.back}</td></tr>`).join("")}</tbody></table></div>

      <h2>스코어 구간</h2>
      <div class="grid g2">
        <div class="tbl-wrap"><table><thead><tr><th class="l">구간</th><th>라운드</th><th>비율</th></tr></thead>
          <tbody>${bands.map((b) => `<tr><td class="l">${b.l}</td><td>${b.n}</td><td>${pct(A.fulls.length ? b.n / A.fulls.length : null)}</td></tr>`).join("")}</tbody></table></div>
        <div class="card"><div class="chart-box"><canvas id="cBand"></canvas></div></div>
      </div>

      <h2>연도별</h2>
      <div class="tbl-wrap"><table><thead><tr><th>연도</th><th>라운드</th><th>18홀</th><th>골프장 수</th><th>평균 타수</th><th>베스트</th><th>워스트</th></tr></thead>
        <tbody>${yr.map((r) => `<tr><td><b>${r.y}</b></td><td>${r.n}</td><td>${r.f}</td><td>${r.c}</td><td>${f1(r.avg)}</td><td>${r.best ?? "-"}</td><td>${r.worst ?? "-"}</td></tr>`).join("")}</tbody></table></div>

      <h2>자주 가는 골프장 <span class="muted">${cs.length}곳</span></h2>
      <div class="tbl-wrap"><table><thead><tr><th>순위</th><th class="l">골프장</th><th>방문</th><th>18홀 평균</th><th>베스트</th><th>최근 방문</th><th>최근 점수</th></tr></thead>
        <tbody>${cs.map((r, i) => `<tr class="click" data-course="${esc(r.c)}"><td>${i + 1}</td><td class="l"><u>${esc(r.c)}</u></td><td>${r.n}</td><td>${f1(r.avg)}</td><td class="${A.best && r.best === A.best.strokes ? "ng" : ""}">${r.best ?? "-"}</td><td>${dot(r.last)}</td><td>${r.lastScore ?? "-"}</td></tr>`).join("")}</tbody></table></div>`;

    app.querySelectorAll("[data-st]").forEach((b) => (b.onclick = () => {
      const t = types.find((x) => x.key === b.dataset.st);
      app.querySelectorAll("[data-st]").forEach((x) => x.classList.toggle("sel", x === b));
      const list = S.byRecent(t.rounds);
      document.getElementById("stList").innerHTML = `<h3>${t.label}가 나온 라운드 <span class="muted">${list.length}회 · 총 ${t.n}번</span></h3>
        <div class="tbl-wrap"><table><thead><tr><th>날짜</th><th class="l">골프장</th><th>횟수</th></tr></thead>
        <tbody>${list.map((x) => `<tr class="click" data-id="${esc(x.id)}"><td>${dot(x.date)}</td><td class="l">${esc(x.course)}</td><td><b>${x.n}</b></td></tr>`).join("")}</tbody></table></div>`;
      bindRows();
    }));
    app.querySelectorAll("[data-ty]").forEach((b) => (b.onclick = () => { trendYear = b.dataset.ty; statsView(); }));
    app.querySelectorAll("[data-course]").forEach((tr) => (tr.onclick = () => { F.course = tr.dataset.course; ls.set(KEY_FILTER, F); location.hash = "#/rounds"; }));
    const bindRows = () => app.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = "#/round/" + encodeURIComponent(tr.dataset.id))));
    bindRows();
    charts.forEach((c) => c.destroy());
    charts = [];
    chart("cTB", {
      type: "bar",
      data: {
        labels: TB.buckets.map((b) => b.k),
        datasets: [
          { type: "line", label: "평균 타수", data: TB.buckets.map((b) => b.avg), borderColor: "#e5352b", backgroundColor: "#e5352b", yAxisID: "y", pointRadius: 4, tension: 0, spanGaps: true },
          { type: "bar", label: "라운드 수", data: TB.buckets.map((b) => b.n), backgroundColor: "rgba(31,111,214,.35)", yAxisID: "y1" },
        ],
      },
      options: baseOpts({ plugins: legendOn, scales: { y: { position: "left", suggestedMin: 80, suggestedMax: 105, ...noGrid }, y1: { position: "right", beginAtZero: true, ...noGrid, ticks: { precision: 0 } }, x: noGrid } }),
      plugins: [valueLabels((v) => (Number.isInteger(v) ? v : v.toFixed(1)))],
    });
    chart("cBand", { type: "bar", data: { labels: bands.map((b) => b.l), datasets: [{ data: bands.map((b) => b.n), backgroundColor: "#2e7d5b" }] }, options: baseOpts({ scales: { y: { beginAtZero: true, ...noGrid }, x: noGrid } }), plugins: [valueLabels((v) => v)] });
    bindFilter();
  }

  // ───────────── 라운드 인사이트 ─────────────
  function insightsView() {
    const fr = frounds();
    const A = S.analyze(fr, settings);
    const I = S.insights(A.rs);
    if (!I) { app.innerHTML = head("insights") + `<p class="muted">조건에 맞는 라운드가 없습니다.</p>`; return; }
    app.innerHTML = `${head("insights")}
      <div class="card oneline">
        올해 <b>${I.thisYear.n}라운드</b>${isNum(I.thisYear.avg) ? ` · 평균 <b>${f1(I.thisYear.avg)}</b>` : ""}${I.thisYear.best ? ` · 베스트 <b>${I.thisYear.best}</b>` : ""} ·
        첫 기록(${dot(I.first)}) 후 <b>${I.daysSinceFirst.toLocaleString()}일째</b> ·
        이번 달 <b>${I.thisMonth.courses}곳</b>에서 ${I.thisMonth.n}라운드 ·
        ${I.daysSinceLast > 0 ? `마지막 라운드 <b>${I.daysSinceLast}일 전</b>` : I.daysSinceLast === 0 ? `마지막 라운드 <b>오늘</b>` : `다음 라운드 <b>${-I.daysSinceLast}일 뒤</b>`}
      </div>
      <h2>라운드 패턴</h2>
      <div class="kpis">
        ${kpi("평균 라운드 간격", isNum(I.avgGap) ? I.avgGap.toFixed(0) + "일" : "-", "라운드 사이 평균 일수")}
        ${kpi("주말 비중", pct(I.weekendShare), "토·일 라운드")}
        ${kpi("올해 골프장", I.thisYear.courses + "곳", "올해 다녀온 곳")}
        ${I.ampm ? kpi("오전 / 오후", `${I.ampm.am.n} / ${I.ampm.pm.n}`, `평균 ${f1(I.ampm.am.avg)} / ${f1(I.ampm.pm.avg)}`) : kpi("오전 / 오후", "-", "티오프 시간 기록 없음")}
      </div>
      <div class="card" style="margin-top:12px"><h3 class="mt0">요일별 라운드</h3><div class="chart-box"><canvas id="cDow"></canvas></div></div>
      <h2>최근 90일 <span class="muted">${I.d90.n}라운드${isNum(I.d90.avg) ? ` · 평균 ${f1(I.d90.avg)}` : ""}${I.d90.best ? ` · 베스트 ${I.d90.best}` : ""}</span></h2>
      ${I.d90.list.length ? `<div class="tbl-wrap"><table><thead><tr><th>날짜</th><th class="l">골프장</th><th>타수</th><th>오버</th></tr></thead>
        <tbody>${I.d90.list.map((r) => `<tr class="click" data-id="${esc(r.id)}"><td>${dot(r.date)}${r.time ? " " + esc(r.time) : ""}</td><td class="l">${esc(r.course)}</td><td><b>${r.strokes ?? "-"}</b></td><td>${sgn(r.over, 0)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">최근 90일 라운드가 없습니다.</p>`}`;
    app.querySelectorAll("tr[data-id]").forEach((tr) => (tr.onclick = () => (location.hash = "#/round/" + encodeURIComponent(tr.dataset.id))));
    chart("cDow", { type: "bar", data: { labels: I.dow.map((d) => d.l), datasets: [{ data: I.dow.map((d) => d.n), backgroundColor: I.dow.map((d, i) => (i === 0 || i === 6 ? "#e5352b" : "#2e7d5b")) }] }, options: baseOpts({ scales: { y: { beginAtZero: true, ticks: { precision: 0 }, ...noGrid }, x: noGrid } }), plugins: [valueLabels((v) => v)] });
  }

  // ───────────── 스마트스코어 붙여넣기 등록 ─────────────
  let parsed = [];
  function importView() {
    const known = [...new Set(rounds.map((r) => r.course))];
    app.innerHTML = `
      <h2>스마트스코어 붙여넣기 등록</h2>
      <ul class="desc">
        <li>네이버 스마트스코어의 라운드 화면(골프장 · 코스 · 날짜 시간 · 총타수 · 홀별 Par/Score)을 복사해 아래에 붙여 넣으세요. 여러 라운드를 한꺼번에 붙여도 됩니다.</li>
        <li>읽은 결과를 확인하고 고칠 수 있습니다. 같은 날짜·골프장이 이미 있으면 기본으로 빼 둡니다.</li>
        <li><b>홀 길이도 넣을 수 있습니다.</b> 스마트스코어 텍스트에는 거리가 없으니, 각 반쪽의 Par/Score 줄 아래에 <code>거리 343 318 314 ...</code>처럼 한 줄을 더 적으세요. 앞에 티 이름을 쓰면(<code>White 343 318 ...</code>) 그 티로 기록되고, <code>Yard 375 ...</code>로 쓰면 m로 바꿔 저장합니다. 18홀을 한 줄에 적어도 됩니다. 거리는 <b>실제로 친 티</b> 기준으로 넣으세요.</li>
        <li>홀별 Par·Score·거리와 티오프 시간이 들어옵니다. 퍼트 등 상세 항목은 등록 뒤 「수정」에서 채우면 됩니다.</li>
      </ul>
      ${G.canWrite() ? "" : `<div class="notice">저장하려면 <a href="#/settings">설정</a>에서 GitHub 토큰을 넣어 주세요. 읽기와 확인은 지금도 됩니다.</div>`}
      <textarea id="ssText" class="pastebox" placeholder="예)&#10;기흥CC&#10;NORTH, WEST&#10;2026-08-29 07:10&#10;80&#10;홀별 스코어&#10;Par 4 4 3 ...&#10;Score 0 1 0 ...&#10;White 320 300 140 ...   ← 홀 길이(선택)&#10;Par ...&#10;Score ...&#10;White ..."></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" id="bParse" type="button">읽기</button><button class="btn ghost" id="bClear" type="button">지우기</button></div>
      <div id="ssOut"></div>`;
    const $ = (x) => document.getElementById(x);
    $("bClear").onclick = () => { $("ssText").value = ""; $("ssOut").innerHTML = ""; parsed = []; };
    $("bParse").onclick = () => {
      parsed = SmartScore.parse($("ssText").value).map((r) => {
        const course = SmartScore.matchCourse(r.course, known);
        const dup = rounds.some((x) => x.date === r.date && x.course === course);
        return { ...r, course, origCourse: r.course, dup, pick: !dup && r.holes.length > 0 };
      });
      drawParsed();
    };
    function drawParsed() {
      if (!parsed.length) { $("ssOut").innerHTML = `<div class="notice" style="margin-top:10px">라운드를 찾지 못했습니다. 날짜 줄(예: 2025-01-19 11:15)과 Par/Score 줄이 들어 있는지 확인하세요.</div>`; return; }
      const n = parsed.filter((r) => r.pick).length;
      $("ssOut").innerHTML = `
        <h3>읽은 라운드 <span class="muted">${parsed.length}개 · 등록 대상 ${n}개</span></h3>
        <div class="tbl-wrap"><table><thead><tr><th>등록</th><th>날짜</th><th class="l">골프장</th><th class="l">코스</th><th class="l">티</th><th>홀</th><th>거리</th><th>총타수</th><th class="l">확인</th></tr></thead>
        <tbody>${parsed.map((r, i) => `<tr>
          <td><input type="checkbox" data-pick="${i}" ${r.pick ? "checked" : ""} ${r.holes.length ? "" : "disabled"}></td>
          <td>${dot(r.date)}${r.time ? "<br><span class='muted'>" + esc(r.time) + "</span>" : ""}</td>
          <td class="l"><input data-course="${i}" value="${esc(r.course)}" list="knownCourses" style="width:150px">${r.origCourse !== r.course ? `<br><span class="muted">원문: ${esc(r.origCourse)}</span>` : ""}</td>
          <td class="l">${esc([r.front, r.back].filter(Boolean).join(" / ") || "-")}</td>
          <td class="l"><input data-tee="${i}" value="${esc(r.tee || "")}" list="teeOpts" placeholder="${r.distCount ? "티 입력" : "-"}" style="width:84px"></td>
          <td>${r.holes.length}</td>
          <td>${r.distCount ? `${r.distCount}홀` : `<span class="muted">-</span>`}</td>
          <td><b>${r.total ?? "-"}</b>${r.statedTotal !== null && r.statedTotal !== r.total ? `<br><span class="ng">표기 ${r.statedTotal}</span>` : ""}</td>
          <td class="l">${r.dup ? `<span class="pill ng">이미 있음</span> ` : ""}${r.warnings.length ? `<span class="ng">${esc(r.warnings.join(" / "))}</span>` : `<span class="ok">정상</span>`}</td></tr>`).join("")}</tbody></table></div>
        <datalist id="teeOpts">${["White", "Blue", "Red", "Black", "Gold"].map((t) => `<option value="${t}">`).join("")}</datalist>
        ${parsed.some((r) => r.distCount && !r.tee) ? `<p class="legend-note ng">거리가 있는 라운드는 <b>티</b>를 적어 주세요. 다음에 같은 티로 칠 때 거리를 자동으로 불러올 수 있습니다.</p>` : ""}
        <datalist id="knownCourses">${known.sort().map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <div class="row" style="margin-top:10px"><button class="btn" id="bImport" type="button" ${G.canWrite() && n ? "" : "disabled"}>선택한 ${n}개 GitHub에 등록</button></div>`;
      app.querySelectorAll("[data-pick]").forEach((c) => (c.onchange = () => { parsed[c.dataset.pick].pick = c.checked; drawParsed(); }));
      app.querySelectorAll("[data-tee]").forEach((c) => (c.onchange = () => { parsed[c.dataset.tee].tee = c.value.trim(); drawParsed(); }));
      app.querySelectorAll("[data-course]").forEach((c) => (c.onchange = () => {
        const r = parsed[c.dataset.course];
        r.course = c.value.trim();
        r.dup = rounds.some((x) => x.date === r.date && x.course === r.course);
        drawParsed();
      }));
      const bi = $("bImport");
      if (bi) bi.onclick = async () => {
        const picks = parsed.filter((r) => r.pick);
        bi.disabled = true;
        bi.textContent = "등록 중…";
        const objs = picks.map((r, i) => ({ id: "r" + r.date.replaceAll("-", "") + "-" + (Date.now() + i).toString(36), date: r.date, time: r.time, course: r.course, front: r.front, back: r.back, tee: r.tee || "", memo: "스마트스코어 붙여넣기로 등록" + (r.distCount ? ` (거리 ${r.distCount}홀 포함)` : ""), holes: r.holes }));
        try {
          await commit((data) => data.concat(objs).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), `스마트스코어 등록 ${objs.length}건: ${objs.map((o) => o.date + " " + o.course).join(", ")}`.slice(0, 250));
          toast(`${objs.length}개 라운드를 등록했습니다.`);
          parsed = [];
          location.hash = "#/rounds";
        } catch (e) {
          toast(e.message, 6000);
          bi.disabled = false;
          bi.textContent = `선택한 ${picks.length}개 GitHub에 등록`;
        }
      };
    }
  }

  // ───────────── 홀·파 분석 ─────────────
  function holesView() {
    const H = S.holeLevel(frounds());
    const os = H.byHole.map((h) => h.over).filter(isNum);
    const maxO = Math.max(...os), minO = Math.min(...os);
    const prow = (lab, x) => `<tr><td class="l"><b>${lab}</b></td><td>${x.n}</td><td>${f2(x.strokes)}</td><td><b>${sgn(x.over)}</b></td><td>${pct(x.birdie)}</td><td>${pct(x.parExact)}</td><td>${pct(x.bogey)}</td><td>${pct(x.double)}</td><td>${pct(x.triple)}</td></tr>`;
    app.innerHTML = `${head("holes")}
      <h2>파 유형별 <span class="muted">Par가 기록된 ${H.total.n}홀</span></h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">파 유형</th><th>홀 수</th><th>평균 타수</th><th>평균 오버</th><th>버디+</th><th>파</th><th>보기</th><th>더블</th><th>트리플+</th></tr></thead>
        <tbody>${[3, 4, 5].map((p) => prow("파" + p, H.byPar[p])).join("")}${prow("전체", H.total)}</tbody></table></div>
      <div class="grid g2" style="margin-top:12px">
        <div class="card"><h3 class="mt0">파 유형별 평균 오버</h3><div class="chart-box"><canvas id="cPar"></canvas></div></div>
        <div class="card"><h3 class="mt0">연도별 파 유형 평균 오버</h3><div class="chart-box"><canvas id="cYearPar"></canvas></div></div>
      </div>
      <h2>홀 번호별</h2>
      <div class="card"><div class="chart-box"><canvas id="cHole"></canvas></div>
        <p class="legend-note">골프장마다 홀 구성이 달라 홀 난이도 비교가 아니라, 첫 홀(워밍업)·막판(체력·집중력) 같은 흐름 패턴을 보는 용도입니다. 빨강=가장 약함, 파랑=가장 좋음.</p></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>홀</th><th>기록 수</th><th>평균 Par</th><th>평균 타수</th><th>평균 오버</th><th>파 이하</th><th>더블+</th></tr></thead>
        <tbody>${H.byHole.map((x, i) => `<tr><td><b>${i + 1}</b></td><td>${x.n}</td><td>${f1(x.par)}</td><td>${f2(x.strokes)}</td><td class="${x.over === maxO ? "ng" : x.over === minO ? "ok" : ""}"><b>${sgn(x.over)}</b></td><td>${pct(x.parlow)}</td><td>${pct(x.dbl)}</td></tr>`).join("")}</tbody></table></div>`;
    chart("cPar", { type: "bar", data: { labels: ["파3", "파4", "파5"], datasets: [{ data: [3, 4, 5].map((p) => H.byPar[p].over), backgroundColor: "#f28c28" }] }, options: baseOpts({ scales: { y: { beginAtZero: true, ...noGrid }, x: noGrid } }), plugins: [valueLabels(f2)] });
    chart("cYearPar", { type: "line", data: { labels: H.byYearPar.map((y) => y.year), datasets: [["p3", "파3", "#1f6fd6"], ["p4", "파4", "#2e7d5b"], ["p5", "파5", "#f28c28"]].map(([k, l, c]) => ({ label: l, data: H.byYearPar.map((y) => y[k]), borderColor: c, backgroundColor: c, pointRadius: 4, tension: 0 })) }, options: baseOpts({ plugins: legendOn, scales: { y: noGrid, x: noGrid } }), plugins: [valueLabels(f2)] });
    chart("cHole", { type: "bar", data: { labels: H.byHole.map((_, i) => i + 1), datasets: [{ data: H.byHole.map((h) => h.over), backgroundColor: H.byHole.map((h) => (h.over === maxO ? "#e5352b" : h.over === minO ? "#1f6fd6" : "#2e7d5b")) }] }, options: baseOpts({ scales: { y: { beginAtZero: true, ...noGrid }, x: noGrid } }), plugins: [valueLabels(f1)] });
  }

  // ───────────── 상세 분석 (v2 「상세분석」 시트) ─────────────
  function detailView() {
    const fr = frounds();
    const list = S.byRecent(fr);
    const sel = new URLSearchParams(location.hash.split("?")[1] || "").get("r") || "";
    const D = S.detailBlocks(fr, sel || null);
    const t = (title, heads, rows, note) => `<h3>${title}</h3><div class="tbl-wrap"><table><thead><tr>${heads.map((h, i) => `<th class="${i ? "" : "l"}">${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "" : "l"}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${note ? `<p class="legend-note">${note}</p>` : ""}`;
    app.innerHTML = `${head("detail")}
      <h2>상세 분석 <span class="muted">무엇이 스코어를 바꾸나</span></h2>
      <div class="card"><label class="f">분석 범위<select id="scope"><option value="">조건 전체 (${fr.length}라운드)</option>${list.map((r) => `<option value="${esc(r.id)}" ${r.id === sel ? "selected" : ""}>${dot(r.date)} ${esc(r.course)}</option>`).join("")}</select></label>
        <p class="legend-note">${D.n}홀 분석. 상세 항목(FW·퍼트·1st 퍼트·미스 방향 등)을 기록한 홀만 각 표에 집계됩니다.</p></div>
      ${t("① 티샷 FW (파4·파5)", ["", "홀 수", "평균 Score", "더블+ 비율"], [["FW 안착", D.fw.in.n, sgn(D.fw.in.over), pct(D.fw.in.dbl)], ["FW 미스", D.fw.out.n, sgn(D.fw.out.over), pct(D.fw.out.dbl)], ["<b class='ng'>FW 미스 시 추가 타수</b>", "", `<b class="ng">${sgn(D.fw.diff)}</b>`, ""]], "FW 미스 홀의 평균 Score가 안착 홀보다 얼마나 높은지가 '티샷 정확도의 값'입니다. 차이가 크면 비거리보다 방향을 우선 연습합니다.")}
      ${t("② 그린 적중 (GIR)", ["", "홀 수", "평균 Score", "평균 퍼트"], [["GIR 성공", D.gir.hit.n, sgn(D.gir.hit.over), f2(D.gir.hit.putts)], ["GIR 실패", D.gir.miss.n, sgn(D.gir.miss.over), f2(D.gir.miss.putts)]], "GIR 실패 홀의 평균 Score가 +1.5 이상이면 그린 주변(어프로치·벙커)에서 타수가 크게 새고 있다는 뜻입니다.")}
      ${t("③ 첫 퍼트 거리대별", ["", "홀 수", "평균 퍼트", "1퍼트율", "3퍼트율"], D.fp.map((x) => [x.l, x.n, f2(x.putts), pct(x.one), pct(x.three)]), "3퍼트율이 높은 거리대가 거리감 연습 1순위입니다.")}
      <div class="card" style="margin-top:8px"><div class="chart-box"><canvas id="cFp"></canvas></div></div>
      ${t("④ 파 유형별", ["", "홀 수", "평균 Score", "파 이하율", "더블+ 비율"], D.par.map((x) => ["파" + x.p, x.n, sgn(x.over), pct(x.parlow), pct(x.dbl)]), "파5 더블+가 많으면 '3온 전략(안전한 레이업)'을 검토합니다.")}
      ${t("⑤ 티샷 미스 방향", ["", "횟수", "비율", "평균 Score", "평균 벌타"], D.miss.map((x) => [x.l, x.n, pct(x.share), sgn(x.over), f2(x.pen)]), "한쪽으로 쏠림이 크면(예: R 60% 이상) 셋업·그립 점검 신호입니다.")}
      ${t("⑥ 홀 난이도 · 전후반", ["", "홀 수", "평균 Score"], D.hcp.map((x) => [x.l, x.n, sgn(x.over)]), "쉬운 홀(핸디캡 13~18)에서도 평균 +1 이상이면 실수 관리 문제입니다. 핸디캡은 기록한 라운드만 집계됩니다.")}
      ${t("⑧ 홀 길이별 (실제로 친 티 거리)", ["", "홀 수", "평균 Score", "파 이하율", "더블+ 비율", "GIR"],
        [...D.len.p3.map((x) => ["파3 " + x.l, x.n, sgn(x.over), pct(x.parlow), pct(x.dbl), pct(x.gir)]),
         ...D.len.p4.map((x) => ["파4 " + x.l, x.n, sgn(x.over), pct(x.parlow), pct(x.dbl), pct(x.gir)]),
         ...D.len.p5.map((x) => ["파5 " + x.l, x.n, sgn(x.over), pct(x.parlow), pct(x.dbl), pct(x.gir)])],
        `거리를 기록한 ${D.len.n}홀 기준. 긴 파4에서만 크게 무너지면 '보기 공략(3온)'을, 짧은 홀에서도 더블이 많으면 티샷·어프로치 실수를 먼저 점검합니다. 파3 거리대별 GIR은 그 거리의 아이언 정확도입니다.`)}
      ${(() => {
        const AP = Clubs.approachStats(typeof fr !== "undefined" ? fr : rounds, settings, sel || null);
        return t("⑨ 예상 어프로치 클럽별 (추정)", ["", "홀 수", "평균 Score", "GIR", "더블+ 비율"],
          AP.map((x) => [x.label + (x.dist ? ` <span class="muted">${x.dist}m</span>` : ""), x.n, sgn(x.over), pct(x.gir), pct(x.dbl)]),
          `홀 거리와 <a href="#/settings">내 클럽 거리</a>로 그린을 노린 클럽을 추정했습니다(티샷은 드라이버 평균 거리, 파5는 웨지 거리를 남기는 레이업으로 가정). 실제 친 클럽과 다를 수 있으니 경향만 보세요. GIR이 유난히 낮은 클럽이 연습 1순위입니다.${Clubs.isDefault(settings) ? " <b>지금은 예시 클럽 거리</b>로 계산했습니다." : ""}`);
      })()}
      ${t("⑦ 그린 미스 · 어프로치 거리", ["", "홀 수", "평균 Score", "스크램블%"], D.green.map((x) => [x.l, x.n, sgn(x.over), x.scr === null ? "-" : pct(x.scr)]), "짧음이 대부분이면 한 클럽 길게, 30m 이상에서 스크램블이 낮으면 하프 웨지 거리 연습을 우선합니다.")}`;
    document.getElementById("scope").onchange = (e) => { location.hash = "#/detail" + (e.target.value ? "?r=" + encodeURIComponent(e.target.value) : ""); };
    chart("cFp", { type: "bar", data: { labels: D.fp.map((x) => x.l), datasets: [{ label: "1퍼트율", data: D.fp.map((x) => x.one), backgroundColor: "#2e7d5b" }, { label: "3퍼트율", data: D.fp.map((x) => x.three), backgroundColor: "#e5352b" }] }, options: baseOpts({ plugins: legendOn, scales: { y: { beginAtZero: true, ticks: { callback: (v) => Math.round(v * 100) + "%" }, ...noGrid }, x: noGrid } }), plugins: [valueLabels(pct)] });
  }

  // ───────────── 사용자 가이드 ─────────────
  const GUIDE = { app: "MyGolf", url: "supok00.github.io/mygolf", features: { filter: true, import: true, insights: true }, repos: ["mygolf", "golf-round-web", "golf-lounge"] };
  function guideView() {
    app.innerHTML = Guide.render(GUIDE);
    Guide.bind(app);
  }

  // ───────────── 설정·데이터 ─────────────
  function settingsView() {
    const c = G.cfg();
    const tg = settings.targets, rd = settings.radar;
    app.innerHTML = `
      ${native ? "" : `<h2>휴대폰에 앱으로 설치</h2>
      <div class="card">
        ${installPrompt ? `<button class="btn" id="bInstall" type="button">앱 설치</button>` : `<p class="muted mt0">${window.matchMedia("(display-mode: standalone)").matches ? "앱으로 실행 중입니다." : "안드로이드 Chrome: 오른쪽 위 ⋮ 메뉴 → <b>앱 설치</b>(또는 홈 화면에 추가)를 누르세요."}</p>`}
        <p class="legend-note">설치하면 홈 화면 아이콘으로 전체 화면에서 열리고, 인터넷이 없어도 마지막으로 받은 기록을 볼 수 있습니다. APK와 달리 Play 프로텍트 경고가 없습니다.</p>
      </div>`}

      <h2>GitHub 연결</h2>
      <div class="card">
        <p class="muted mt0">데이터 저장 위치: <b>${esc(c.owner)}/${esc(c.repo)}</b> · ${esc(c.path)} — 저장할 때 <b>${c.mirrors.map((m) => esc(m.owner + "/" + m.repo)).join(", ")}</b>에도 같은 변경을 적용합니다.</p>
        <label class="f">GitHub 토큰 (저장하는 기기에서만 입력)<input id="tok" type="password" autocomplete="off" placeholder="${c.token ? "저장됨 (바꾸려면 새로 입력)" : "github_pat_..."}"></label>
        <div class="row" style="margin-top:10px">
          <button class="btn" id="bTok" type="button">토큰 저장</button>
          <button class="btn ghost" id="bTest" type="button" ${c.token ? "" : "disabled"}>연결 확인</button>
          <button class="btn danger" id="bTokDel" type="button" ${c.token ? "" : "disabled"}>토큰 삭제</button>
        </div>
        <div class="notice" style="margin-top:12px">
          <b>토큰 만드는 법</b> (한 번만): GitHub → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token<br>
          · Repository access: <b>Only select repositories → ${esc(c.repo)}, ${c.mirrors.map((m) => esc(m.repo)).join(", ")}</b> (두 저장소 모두 선택. 이미 만든 토큰은 Edit에서 저장소를 추가하면 됩니다)<br>
          · Permissions → Repository permissions → <b>Contents: Read and write</b> (나머지는 그대로)<br>
          · 만료 기간은 짧게(예: 90일) 두고 만료되면 다시 만드세요.<br>
          토큰은 이 브라우저에만 저장되고 GitHub 외 다른 곳으로 보내지 않습니다. 공용 PC에서는 입력하지 말고, 쓰고 나면 「토큰 삭제」를 누르세요. 보기만 하는 기기에는 토큰이 필요 없습니다.
        </div>
      </div>

      <h2>동기화</h2>
      <div class="card">
        <div id="syncBox" class="muted">확인 중…</div>
        <div class="row" style="margin-top:10px">
          <button class="btn ghost" id="bSyncCheck" type="button">다시 확인</button>
          ${[G.PRIMARY, ...G.MIRRORS].map((r) => `<button class="btn ghost" data-sync="${esc(r.repo)}" type="button" ${G.canWrite() ? "" : "disabled"}>${esc(r.repo)} 기준으로 맞추기</button>`).join("")}
        </div>
        <p class="legend-note">평소에는 저장할 때마다 자동으로 모든 저장소에 같이 반영됩니다. 네트워크 오류 등으로 어긋났을 때만 맞추기를 누르세요. 맞추기는 한쪽 내용으로 다른 쪽을 덮어씁니다.</p>
      </div>

      <h2>목표 기준값</h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">지표</th><th>목표</th><th>방향</th></tr></thead>
        <tbody>${Object.entries(tg).map(([k, t]) => `<tr><td class="l">${t.label}</td><td><input data-t="${k}" type="number" step="${t.fmt === "%" ? 1 : 0.5}" value="${t.fmt === "%" ? Math.round(t.v * 100) : t.v}" style="width:90px"> ${t.fmt === "%" ? "%" : ""}</td><td class="muted">${t.low ? "낮을수록 좋음" : "높을수록 좋음"}</td></tr>`).join("")}</tbody></table></div>
      <h2>육각형 점수 기준 <span class="muted">0점 / 100점</span></h2>
      <div class="tbl-wrap"><table><thead><tr><th class="l">영역</th><th class="l">지표</th><th>0점</th><th>100점</th></tr></thead>
        <tbody>${Object.entries(rd).map(([k, x]) => `<tr><td class="l"><b>${x.label}</b></td><td class="l">${x.metric}</td><td><input data-rz="${k}" type="number" step="0.05" value="${x.zero}" style="width:80px"></td><td><input data-rf="${k}" type="number" step="0.05" value="${x.full}" style="width:80px"></td></tr>`).join("")}
        <tr><td class="l"><b>목표선</b></td><td class="l">육각형 기준선 점수</td><td colspan="2"><input id="rTarget" type="number" value="${settings.radarTarget}" style="width:80px"></td></tr></tbody></table></div>
      <p class="legend-note">기준값은 아마추어 핸디캡별 통계 경향을 참고한 가정값입니다(100점 ≈ 싱글~10 핸디캡, 0점 ≈ 초보). 비율은 0~1로 입력합니다.</p>
      <div class="row" style="margin-top:10px"><button class="btn" id="bSaveSet" type="button" ${G.canWrite() ? "" : "disabled"}>기준값 GitHub에 저장</button><button class="btn ghost" id="bResetSet" type="button">기본값 불러오기</button></div>

      <h2>내 클럽 거리 <span class="muted">평균 거리(m), 굴러간 거리 포함</span></h2>
      ${Clubs.isDefault(settings) ? `<div class="notice">지금은 <b>예시값</b>입니다. 내 평균 거리로 바꾸고 저장하세요. 연습장이나 스마트 거리측정 기록의 '평소 거리'를 넣으면 됩니다(최고 거리 아님).</div>` : ""}
      <div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>사용</th><th class="l">클럽</th><th>거리(m)</th></tr></thead>
        <tbody>${(Array.isArray(settings.clubs) ? settings.clubs : Clubs.DEFAULT_BAG).map((c, i) => `<tr><td><input type="checkbox" data-con="${i}" ${c.on ? "checked" : ""}></td><td class="l"><input data-clab="${i}" value="${esc(c.label)}" style="width:170px"></td><td><input data-cdist="${i}" type="number" inputmode="numeric" step="5" min="0" value="${c.dist}" style="width:84px"></td></tr>`).join("")}</tbody></table></div>
      <div id="gapBox" style="margin-top:8px"></div>
      <div class="row" style="margin-top:10px"><button class="btn" id="bSaveClubs" type="button" ${G.canWrite() ? "" : "disabled"}>클럽 거리 GitHub에 저장</button><button class="btn ghost" id="bClubDefault" type="button">예시값으로</button></div>
      <p class="legend-note">저장하면 라운드 입력의 <b>공략 가이드</b>와 상세 분석 <b>⑨ 예상 어프로치 클럽별</b>에 쓰입니다. 안 쓰는 클럽은 「사용」을 끄세요.</p>

      <h2>버전 <span class="muted">v${APP_VERSION}</span></h2>
      <div class="card">${APP_CHANGES.map((c) => `<h3 class="mt0">v${c.v} <span class="muted">${c.date}</span></h3><ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`).join("")}
        <p class="legend-note">작은 변경은 1.1, 1.2 …, 큰 개편은 2.0으로 올립니다. 새 버전이 나오면 화면 아래에 「새 버전이 있습니다 — 지금 적용」이 뜹니다.</p></div>

      <h2>백업</h2>
      ${native ? `<p class="muted">앱에서는 파일 내려받기가 안 됩니다. 백업은 웹 페이지에서 하거나 GitHub 저장소의 data/rounds.json을 쓰세요.</p>` : `<div class="row"><button class="btn ghost" id="bExport" type="button">rounds.json 내려받기</button></div>`}
      <p class="muted">현재 ${rounds.length}라운드 · GitHub 저장소의 커밋 기록에 모든 변경 이력이 남습니다.</p>`;
    const $ = (s) => document.getElementById(s);
    if ($("bInstall")) $("bInstall").onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; settingsView(); };
    $("bTok").onclick = async () => {
      const v = $("tok").value.trim();
      if (!v) return toast("토큰을 입력하세요.");
      G.setCfg({ token: v });
      $("tok").value = "";
      const t = await G.testToken();
      toast(t.msg, 4000);
      renderStatus();
      settingsView();
    };
    const syncCheck = async () => {
      const box = $("syncBox");
      box.textContent = "확인 중…";
      try {
        const st = await G.syncStatus();
        box.innerHTML = st.map((x) => `<div>${x.same ? `<span class="ok">● 일치</span>` : `<span class="ng">● 다름</span>`} ${esc(x.path)} ↔ ${esc(x.mirror)}${x.a !== null ? ` (${x.a} / ${x.b}라운드)` : ""}${x.error ? ` <span class="ng">${esc(x.error)}</span>` : ""}</div>`).join("");
      } catch (e) { box.textContent = "확인 실패: " + e.message; }
    };
    syncCheck();
    $("bSyncCheck").onclick = syncCheck;
    const doSync = async (from) => {
      try {
        for (const p of ["data/rounds.json", "data/settings.json"]) await G.resync(from, p);
        toast("두 저장소를 맞췄습니다.");
        await loadAll(true);
        settingsView();
      } catch (e) { toast(e.message, 6000); }
    };
    app.querySelectorAll("[data-sync]").forEach((b) => (b.onclick = () => doSync(b.dataset.sync)));
    $("bTest").onclick = async () => toast((await G.testToken()).msg, 4000);
    $("bTokDel").onclick = () => { G.setCfg({ token: "" }); toast("이 기기에서 토큰을 지웠습니다."); renderStatus(); settingsView(); };
    $("bSaveSet").onclick = async () => {
      app.querySelectorAll("[data-t]").forEach((el) => { const t = tg[el.dataset.t]; const v = Number(el.value); if (el.value !== "" && isNum(v)) t.v = t.fmt === "%" ? v / 100 : v; });
      app.querySelectorAll("[data-rz]").forEach((el) => { const v = Number(el.value); if (el.value !== "" && isNum(v)) rd[el.dataset.rz].zero = v; });
      app.querySelectorAll("[data-rf]").forEach((el) => { const v = Number(el.value); if (el.value !== "" && isNum(v)) rd[el.dataset.rf].full = v; });
      const rt = Number($("rTarget").value);
      if (isNum(rt)) settings.radarTarget = rt;
      try {
        const { mirrorErrors } = await G.update(() => settings, "기준값 변경", "data/settings.json");
        if (mirrorErrors.length) throw new Error("기준값은 저장했지만 동기화 실패: " + mirrorErrors.join(" / "));
        toast("기준값을 GitHub에 저장했습니다.");
      } catch (e) { toast(e.message, 6000); }
    };
    $("bResetSet").onclick = () => { settings = structuredClone(S.DEFAULT_SETTINGS); settingsView(); toast("기본값을 불러왔습니다. 저장하려면 「기준값 GitHub에 저장」을 누르세요."); };
    // 클럽 거리: 입력이 바뀔 때마다 간격 점검을 다시 보여 준다
    const baseClubs = (Array.isArray(settings.clubs) ? settings.clubs : Clubs.DEFAULT_BAG).map((c) => ({ ...c }));
    const readClubs = () => baseClubs.map((c, i) => ({
      key: c.key, label: (app.querySelector(`[data-clab="${i}"]`).value || c.label).trim(),
      dist: Number(app.querySelector(`[data-cdist="${i}"]`).value) || 0, on: app.querySelector(`[data-con="${i}"]`).checked,
    }));
    const drawGaps = () => {
      const gs = Clubs.gaps(Clubs.bag({ clubs: readClubs() }));
      $("gapBox").innerHTML = gs.length ? `<div class="notice"><b>클럽 간격 점검</b><br>${gs.map((g) => `· [${g.type}] ${esc(g.text)}`).join("<br>")}</div>` : `<p class="legend-note ok">클럽 간 거리 간격이 고릅니다.</p>`;
    };
    app.querySelectorAll("[data-con],[data-clab],[data-cdist]").forEach((el) => el.addEventListener("input", drawGaps));
    drawGaps();
    $("bSaveClubs").onclick = async () => {
      settings.clubs = readClubs();
      try {
        const { mirrorErrors } = await G.update(() => settings, "클럽 거리 변경", G.SETTINGS || "data/settings.json");
        toast(mirrorErrors.length ? "클럽 거리는 저장했지만 동기화 실패: " + mirrorErrors.join(" / ") : "클럽 거리를 저장했습니다.", 4000);
        settingsView();
      } catch (e) { toast(e.message, 6000); }
    };
    $("bClubDefault").onclick = () => { delete settings.clubs; settingsView(); toast("예시값을 불러왔습니다. 저장하려면 「클럽 거리 GitHub에 저장」을 누르세요."); };
    if ($("bExport")) $("bExport").onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(rounds, null, 1)], { type: "application/json" }));
      a.download = `rounds-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }

  // ───────────── 안드로이드 앱(Capacitor) ─────────────
  // 뒤로 가기 버튼: 화면 이동 기록이 있으면 이전 화면, 없으면 앱 종료
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (native && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && location.hash && location.hash !== "#/dashboard") history.back();
      else window.Capacitor.Plugins.App.exitApp();
    });
  }

  // ───────────── 설치형 웹앱(PWA) ─────────────
  let installPrompt = null;
  if (!native && "serviceWorker" in navigator && location.protocol === "https:") {
    // 새 버전 알림: 새 서비스 워커가 설치되어 화면을 넘겨받으면(controllerchange) 적용 버튼을 띄운다.
    // 처음 설치할 때는 이전 버전이 없으므로 띄우지 않는다.
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (hadController) showUpdateBar();
      hadController = true;
    });
    navigator.serviceWorker.register("sw.js").then((reg) => {
      const check = () => reg.update().catch(() => { /* 오프라인 */ });
      // 설치형 앱은 오래 켜 두거나 백그라운드에서 돌아오는 일이 많아, 돌아올 때와 30분마다 새 버전을 확인한다
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      setInterval(check, 30 * 60 * 1000);
    }).catch(() => { /* 지원하지 않는 브라우저 */ });
  }
  function showUpdateBar() {
    if (document.getElementById("updBar")) return;
    const bar = document.createElement("div");
    bar.id = "updBar";
    bar.className = "updbar";
    bar.innerHTML = `<span>✨ 새 버전이 있습니다</span><button class="btn" id="updNow" type="button">지금 적용</button><button class="link" id="updLater" type="button">나중에</button>`;
    document.body.appendChild(bar);
    // 입력 중인 라운드는 기기에 임시 저장되어 있어 새로고침해도 이어서 쓸 수 있다
    document.getElementById("updNow").onclick = () => location.reload();
    document.getElementById("updLater").onclick = () => bar.remove();
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    if (location.hash.startsWith("#/settings")) settingsView();
  });

  // ───────────── 시작 ─────────────
  (() => {
    const KEY_VER = KEY_CACHE.split(".")[0] + ".seenVersion";
    const seen = ls.get(KEY_VER);
    if (seen && seen !== APP_VERSION) {
      const c = APP_CHANGES.find((x) => x.v === APP_VERSION);
      setTimeout(() => toast(`v${APP_VERSION}로 업데이트되었습니다${c ? "\n" + c.items.slice(0, 3).map((x) => "· " + x).join("\n") : ""}`, 7000), 1200);
    }
    ls.set(KEY_VER, APP_VERSION);
  })();
  (async () => {
    const cached = ls.get(KEY_CACHE);
    if (Array.isArray(cached)) { rounds = cached; source = "cache"; }
    window.addEventListener("hashchange", route);
    if (rounds.length) route();
    else app.innerHTML = `<p class="muted">데이터를 불러오는 중…</p>`;
    await loadAll(true);
    route();
  })();
})();
