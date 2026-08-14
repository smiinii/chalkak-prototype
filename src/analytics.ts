const POSTHOG_PROJECT_TOKEN = "phc_mhRumFfR34DFBjnnsxbKgRcbvwR7Q49YXmMQZ5XZj4LT";
const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const VISITOR_STORAGE_KEY = "chalkak-daily-anonymous-visitor";

function createAnonymousId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayInSeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dailyAnonymousId() {
  const date = todayInSeoul();

  try {
    const saved = JSON.parse(window.localStorage.getItem(VISITOR_STORAGE_KEY) || "null") as {
      date?: unknown;
      id?: unknown;
    } | null;
    if (saved?.date === date && typeof saved.id === "string" && saved.id) return saved.id;

    const id = createAnonymousId();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify({ date, id }));
    return id;
  } catch {
    return createAnonymousId();
  }
}

export function trackArchiveVisit() {
  try {
    if (window.location.hostname !== "chalkak.pysun.kr") return;

    const distinctId = dailyAnonymousId();

    void fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event: "$pageview",
        distinct_id: distinctId,
        properties: {
          $process_person_profile: false,
          $geoip_disable: true,
          chalkak_archive: true,
        },
      }),
    }).catch(() => {
      // Analytics must never interrupt the archive experience.
    });
  } catch {
    // Analytics must never interrupt the archive experience.
  }
}
