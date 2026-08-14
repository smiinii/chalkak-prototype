import { writeFile } from "node:fs/promises";

const outputPath = new URL("../public/data/analytics.json", import.meta.url);
const personalKey = process.env.POSTHOG_PERSONAL_API_KEY?.trim();
const projectId = process.env.POSTHOG_PROJECT_ID?.trim();
const apiHost = "https://us.posthog.com";
const timezone = "Asia/Seoul";
const liveSnapshotUrl = "https://chalkak.pysun.kr/data/analytics.json";

async function writeSnapshot(snapshot) {
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

async function reuseLiveSnapshot() {
  try {
    const response = await fetch(`${liveSnapshotUrl}?t=${Date.now()}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const snapshot = await response.json();
    if (
      typeof snapshot?.configured !== "boolean" ||
      snapshot?.timezone !== timezone ||
      !Array.isArray(snapshot?.days)
    ) return false;
    await writeSnapshot(snapshot);
    console.log("현재 배포된 방문 통계를 그대로 사용합니다.");
    return true;
  } catch {
    return false;
  }
}

if (!personalKey || !projectId) {
  if (!(await reuseLiveSnapshot())) console.log("PostHog 조회 설정 전이라 빈 통계 파일을 사용합니다.");
  process.exit(0);
}

try {
  const query = `
    SELECT
      toString(toDate(timestamp, '${timezone}')) AS date,
      uniqExact(distinct_id) AS visitors,
      count() AS views
    FROM events
    WHERE event = '$pageview'
      AND properties.chalkak_archive = true
      AND timestamp >= now() - INTERVAL 31 DAY
    GROUP BY date
    ORDER BY date ASC
  `;

  const response = await fetch(`${apiHost}/api/projects/${encodeURIComponent(projectId)}/query/`, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${personalKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "chalkak daily visitors",
      query: { kind: "HogQLQuery", query },
    }),
  });

  if (!response.ok) throw new Error(`PostHog 통계 조회 실패 (${response.status})`);

  const payload = await response.json();
  if (!Array.isArray(payload.results)) throw new Error("PostHog 통계 응답 형식이 예상과 다릅니다.");

  const counts = new Map(
    payload.results.map((row) => {
      if (!Array.isArray(row) || row.length < 3) throw new Error("PostHog 통계 행 형식이 예상과 다릅니다.");
      return [String(row[0]), { visitors: Number(row[1]) || 0, views: Number(row[2]) || 0 }];
    }),
  );

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const todayUtc = Date.parse(`${today}T00:00:00Z`);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(todayUtc - (29 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, ...(counts.get(date) || { visitors: 0, views: 0 }) };
  });

  await writeSnapshot({ configured: true, updatedAt: new Date().toISOString(), timezone, days });
  console.log(`최근 ${days.length}일 방문 통계를 생성했습니다.`);
} catch (error) {
  console.warn(`::warning::${error instanceof Error ? error.message : "PostHog 통계를 갱신하지 못했습니다."}`);
  if (!(await reuseLiveSnapshot())) console.warn("::warning::기존 통계가 없어 빈 통계 파일을 사용합니다.");
}
