/* 네이버 스마트스코어 「홀별 스코어」 텍스트를 라운드로 바꾼다.
 * 한 라운드의 모양(여러 라운드를 이어 붙여도 됨):
 *   골프장명
 *   전반코스, 후반코스        (없으면 "-")
 *   2025-01-19 11:15
 *   96                         (총타수)
 *   ...
 *   Par    4  3  4 ... 36
 *   Score  1  2  2 ... 45     (파 기준 +/-, 마지막 칸은 9홀 타수 합계)
 *   Par / Score (후반)
 * 라운드 사이가 ", 다음골프장"처럼 한 줄에 붙어 와도 나눈다.
 */
const SmartScore = (() => {
  const DATE = /^(\d{4})[-.](\d{1,2})[-.](\d{1,2})(?:\s+(\d{1,2}:\d{2}))?\s*$/;
  const ints = (s) => (s.match(/-?\d+/g) || []).map(Number);
  const sum = (a) => a.reduce((x, y) => x + y, 0);

  function normalize(text) {
    const out = [];
    for (let line of String(text).replace(/\r/g, "").split("\n")) {
      line = line.replace(/\t/g, " ").trim();
      // "Score ... 51, 인천그랜드CC" → 점수 줄과 다음 골프장 줄로 나눈다
      const m = line.match(/^(score\b[^,]*),\s*(.+)$/i);
      if (m) { out.push(m[1].trim(), m[2].trim()); continue; }
      out.push(line.replace(/^,\s*/, ""));
    }
    return out;
  }

  function prevNonEmpty(lines, i) {
    for (let j = i - 1; j >= 0; j--) if (lines[j]) return j;
    return -1;
  }

  // Par 줄의 마지막 숫자가 앞 숫자들의 합이면 합계 칸으로 보고 뺀다
  function nine(parNums, scoreNums) {
    let k = parNums.length;
    if (k >= 2 && parNums[k - 1] === sum(parNums.slice(0, k - 1))) k -= 1;
    const pars = parNums.slice(0, k);
    const scores = scoreNums.slice(0, k);
    const statedStrokes = scoreNums.length > k ? scoreNums[k] : null;
    return { pars, scores, statedStrokes };
  }

  function parse(text) {
    const lines = normalize(text);
    const dateIdx = lines.map((l, i) => (DATE.test(l) ? i : -1)).filter((i) => i >= 0);
    const rounds = [];
    dateIdx.forEach((di, n) => {
      const warnings = [];
      const [, y, mo, d, time] = lines[di].match(DATE);
      const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const ci = prevNonEmpty(lines, di);          // 코스 줄
      const gi = prevNonEmpty(lines, ci);          // 골프장 줄
      let course = gi >= 0 ? lines[gi] : "";
      let courses = ci >= 0 ? lines[ci] : "";
      // 코스 줄이 없고 바로 골프장명이 오는 경우
      if (/^\d/.test(course) || /^(par|score|홀)\b/i.test(course)) { course = courses; courses = ""; }
      const parts = courses.split(",").map((s) => s.trim()).filter((s) => s && s !== "-");
      const end = n + 1 < dateIdx.length ? prevNonEmpty(lines, prevNonEmpty(lines, dateIdx[n + 1])) : lines.length;
      let statedTotal = null;
      const ti = lines.findIndex((l, i) => i > di && l);
      if (ti > 0 && /^\d{2,3}$/.test(lines[ti])) statedTotal = Number(lines[ti]);

      const rows = lines.slice(di + 1, end).filter((l) => /^(par|score)\b/i.test(l));
      const pars = rows.filter((l) => /^par/i.test(l)).map((l) => ints(l.slice(3)));
      const scores = rows.filter((l) => /^score/i.test(l)).map((l) => ints(l.slice(5)));
      const holes = [];
      for (let half = 0; half < Math.min(2, pars.length, scores.length); half++) {
        const x = nine(pars[half], scores[half]);
        const sumStrokes = sum(x.pars) + sum(x.scores);
        if (x.statedStrokes !== null && x.statedStrokes !== sumStrokes) warnings.push(`${half ? "후반" : "전반"} 합계 불일치(표기 ${x.statedStrokes}, 계산 ${sumStrokes})`);
        x.pars.forEach((p, i) => holes.push({ h: half * 9 + i + 1, par: p, score: x.scores[i] }));
      }
      const total = holes.length ? sum(holes.map((h) => h.par + h.score)) : null;
      if (!holes.length) warnings.push("Par/Score 줄을 찾지 못했습니다");
      else if (holes.length !== 18) warnings.push(`${holes.length}홀만 읽었습니다`);
      if (statedTotal !== null && total !== null && statedTotal !== total) warnings.push(`총타수 불일치(표기 ${statedTotal}, 계산 ${total})`);
      rounds.push({ date, time: time || "", course: course.trim(), front: parts[0] || "", back: parts[1] || "", statedTotal, total, holes, warnings });
    });
    return rounds;
  }

  // 이미 쓰는 골프장 이름과 맞춰 본다 (띄어쓰기·컨트리클럽/골프클럽 표기 차이)
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/컨트리클럽|countryclub/g, "cc").replace(/골프클럽|골프앤리조트|골프리조트|golfclub/g, "gc").replace(/[()]/g, "");
  function matchCourse(name, known) {
    const n = norm(name);
    if (!n) return name;
    const exact = known.find((k) => norm(k) === n);
    if (exact) return exact;
    const pre = known.filter((k) => { const kk = norm(k); return kk.length >= 3 && (n.startsWith(kk) || kk.startsWith(n)); }).sort((a, b) => b.length - a.length);
    return pre[0] || name;
  }

  return { parse, matchCourse };
})();
if (typeof module !== "undefined") module.exports = SmartScore;
