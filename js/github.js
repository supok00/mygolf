/* GitHub 저장소를 데이터 저장소로 쓴다. (기본: golf-round-web 저장소의 데이터를 함께 쓴다)
 * - 읽기: GitHub API(토큰 없이도 공개 저장소면 가능)로 data/rounds.json 최신본을 받는다.
 *         API 호출 한도(시간당 60회/IP)에 걸리면 같은 사이트의 data/rounds.json(Pages 배포본)을 쓴다.
 * - 쓰기: 이 저장소 전용 토큰(Contents 읽기/쓰기)으로 파일을 커밋한다. 토큰은 이 브라우저에만 저장된다.
 */
const GitHubStore = (() => {
  const KEY_CFG = "mygolf.github.v1";
  // 같은 사이트(supok00.github.io)의 golf-round-web에서 쓰던 설정(토큰 포함)이 있으면 처음 한 번 가져온다
  try {
    if (!localStorage.getItem(KEY_CFG) && localStorage.getItem("golf.github.v1")) localStorage.setItem(KEY_CFG, localStorage.getItem("golf.github.v1"));
  } catch { /* 저장소 사용 불가 */ }
  const DEFAULT = { owner: "supok00", repo: "golf-round-web", branch: "main", path: "data/rounds.json", token: "" };

  function cfg() {
    try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY_CFG)) || {}) }; } catch { return { ...DEFAULT }; }
  }
  function setCfg(c) {
    try { localStorage.setItem(KEY_CFG, JSON.stringify({ ...cfg(), ...c })); return true; } catch { return false; }
  }
  const canWrite = () => !!cfg().token;

  // UTF-8 ↔ base64 (한글이 들어 있어 atob/btoa만으로는 깨진다)
  function b64decode(b64) {
    const bin = atob(b64.replace(/\n/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function apiUrl(c, path = c.path) {
    return `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${path}`;
  }
  function headers(c) {
    const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (c.token) h.Authorization = `Bearer ${c.token}`;
    return h;
  }

  // 반환: { data, sha, source: 'github' | 'pages' }
  async function load(path) {
    const c = cfg();
    const p = path || c.path;
    try {
      const res = await fetch(`${apiUrl(c, p)}?ref=${encodeURIComponent(c.branch)}&t=${Date.now()}`, { headers: headers(c), cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        // 1MB 넘는 파일은 content가 비어 오므로 download_url로 다시 받는다
        const text = j.content ? b64decode(j.content) : await (await fetch(j.download_url, { cache: "no-store" })).text();
        return { data: JSON.parse(text), sha: j.sha, source: "github" };
      }
      // 404: 아직 파일이 없음 → sha 없이 새로 만들 수 있게 표시하고, 보기용으로는 배포본을 쓴다
      if (res.status === 404) {
        const fb = await fetch(`${p}?t=${Date.now()}`, { cache: "no-store" }).catch(() => null);
        return { data: fb && fb.ok ? await fb.json() : null, sha: null, source: "github", missing: true };
      }
      if (res.status === 401) throw new Error("토큰이 올바르지 않거나 만료되었습니다(401).");
    } catch (e) {
      if (String(e.message).includes("401")) throw e;
    }
    const res = await fetch(`${p}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { data: null, sha: null, source: "pages" };
    return { data: await res.json(), sha: null, source: "pages" };
  }

  async function put(path, obj, sha, message) {
    const c = cfg();
    const res = await fetch(apiUrl(c, path), {
      method: "PUT",
      headers: { ...headers(c), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content: b64encode(JSON.stringify(obj, null, 1) + "\n"), sha: sha || undefined, branch: c.branch }),
    });
    if (res.ok) return (await res.json()).content.sha;
    const err = new Error(`GitHub 저장 실패 (${res.status})`);
    err.status = res.status;
    try { err.detail = (await res.json()).message; } catch { /* 본문 없음 */ }
    throw err;
  }

  /* 변경 함수(mutate)를 최신본에 적용해 커밋한다.
   * 다른 기기에서 먼저 저장해 sha가 바뀌었으면(409/422) 최신본을 다시 받아 같은 변경을 한 번 더 적용한다. */
  async function update(mutate, message, path) {
    const c = cfg();
    const p = path || c.path;
    if (!c.token) throw new Error("GitHub 토큰이 없습니다. 설정에서 토큰을 넣어 주세요.");
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await load(p);
      if (cur.source !== "github") throw new Error("GitHub에서 최신 데이터를 읽지 못했습니다.");
      const next = mutate(cur.missing ? null : cur.data);
      try {
        await put(p, next, cur.sha, message);
        return next;
      } catch (e) {
        if (e.status === 409 || e.status === 422) continue;
        if (e.status === 401 || e.status === 403) throw new Error("토큰 권한이 없습니다. 이 저장소의 Contents 읽기/쓰기 권한이 있는 토큰인지 확인하세요.");
        throw e;
      }
    }
    throw new Error("다른 기기와 동시에 저장되어 충돌했습니다. 잠시 후 다시 저장하세요.");
  }

  async function testToken() {
    const c = cfg();
    const res = await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}`, { headers: headers(c) });
    if (!res.ok) return { ok: false, msg: `저장소 접근 실패 (${res.status})` };
    const j = await res.json();
    return j.permissions && j.permissions.push ? { ok: true, msg: "저장 권한 확인됨" } : { ok: false, msg: "읽기만 가능한 토큰입니다(쓰기 권한 없음)" };
  }

  return { cfg, setCfg, canWrite, load, update, testToken, DEFAULT };
})();
