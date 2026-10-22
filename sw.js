/* 오프라인에서도 앱 화면이 열리도록 화면 파일만 캐시한다.
 * 데이터(GitHub API)는 캐시하지 않는다 — 항상 최신을 읽고, 실패하면 앱이 자체 캐시를 쓴다.
 * 화면 파일은 '캐시 먼저 보여주고 뒤에서 갱신' 방식이라 새 버전은 다음 실행 때 반영된다. */
const CACHE = "mygolf-shell-v5";
const SHELL = ["./", "index.html", "css/style.css", "js/github.js", "js/stats.js", "js/smartscore.js", "js/guide.js", "js/app.js", "manifest.webmanifest", "icons/icon-192.png",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.hostname === "api.github.com" || url.pathname.includes("/data/")) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
