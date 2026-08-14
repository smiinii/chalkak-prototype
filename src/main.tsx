import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { publishGalleryDay } from "./github";
import type { GalleryData, GalleryDay, GalleryPhoto, UploadDraft } from "./types";
import "./styles.css";

const ADMIN_ACCESS_HASH = "2b9c5a66f37495d04bc54fc66291c6940d3cf73d1f653b824532fecafdc5b332";
const BASE_URL = import.meta.env.BASE_URL;

function isValidIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isPastOrToday(value: string | null, today = todayString()): value is string {
  return isValidIsoDate(value) && value <= today;
}

function initialDateFromUrl() {
  const value = new URLSearchParams(window.location.search).get("date");
  return isPastOrToday(value) ? value : "";
}

function formatDate(date: string) {
  if (!date) return "날짜 선택";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00`));
}

function formatShortDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
}

function resolvePhotoSource(src: string) {
  if (/^(https?:|blob:|data:)/.test(src)) return src;
  return `${BASE_URL}${src.replace(/^\/+/, "")}`;
}

function todayString() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function updateQuery(updates: Record<string, string | null>, replace = false) {
  const url = new URL(window.location.href);
  Object.entries(updates).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  });
  window.history[replace ? "replaceState" : "pushState"]({}, "", url);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function AccessModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((await sha256(code)) === ADMIN_ACCESS_HASH) {
      onSuccess();
      return;
    }
    setError("비밀번호가 올바르지 않습니다.");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="access-modal" role="dialog" aria-modal="true" aria-labelledby="access-title">
        <button className="icon-button modal-close" type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <div className="modal-symbol" aria-hidden="true">●</div>
        <p className="eyebrow">ADMIN</p>
        <h2 id="access-title">관리자 확인</h2>
        <p className="modal-copy">사진을 올리려면 관리자 비밀번호를 입력해 주세요.</p>
        <form onSubmit={submit}>
          <label className="field-label" htmlFor="admin-code">비밀번호</label>
          <div className="password-row">
            <input
              id="admin-code"
              autoFocus
              autoComplete="current-password"
              type={visible ? "text" : "password"}
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "access-error" : undefined}
              placeholder="비밀번호 입력"
            />
            <button type="button" className="text-button" onClick={() => setVisible((value) => !value)}>
              {visible ? "숨기기" : "보기"}
            </button>
          </div>
          {error && <p className="form-error" id="access-error">{error}</p>}
          <button className="primary-button full-button" type="submit">관리자 페이지 열기</button>
        </form>
      </section>
    </div>
  );
}

function Lightbox({
  photos,
  initialIndex,
  topic,
  onClose,
}: {
  photos: GalleryPhoto[];
  initialIndex: number;
  topic: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") setIndex((value) => (value - 1 + photos.length) % photos.length);
      if (event.key === "ArrowRight") setIndex((value) => (value + 1) % photos.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, photos.length]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={`${topic} 사진 크게 보기`}>
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="사진 닫기">×</button>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            className="lightbox-arrow lightbox-prev"
            onClick={() => setIndex((value) => (value - 1 + photos.length) % photos.length)}
            aria-label="이전 사진"
          >
            ‹
          </button>
          <button
            type="button"
            className="lightbox-arrow lightbox-next"
            onClick={() => setIndex((value) => (value + 1) % photos.length)}
            aria-label="다음 사진"
          >
            ›
          </button>
        </>
      )}
      <figure className="lightbox-figure">
        <img src={resolvePhotoSource(photo.src)} alt={`${topic} 사진 ${index + 1}`} />
        <figcaption>
          <span>{index + 1} / {photos.length}</span>
        </figcaption>
      </figure>
    </div>
  );
}

function PhotoGallery({ day }: { day: GalleryDay }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="photo-grid" aria-label={`${day.topic} 사진 ${day.photos.length}장`}>
        {day.photos.map((photo, index) => (
          <button
            className="photo-card"
            type="button"
            key={photo.id}
            onClick={() => setLightboxIndex(index)}
            aria-label={`${day.topic} 사진 ${index + 1} 크게 보기`}
          >
            <img
              src={resolvePhotoSource(photo.src)}
              alt={`${day.topic} 사진 ${index + 1}`}
              loading={index < 4 ? "eager" : "lazy"}
              style={photo.width && photo.height ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined}
            />
          </button>
        ))}
      </div>
      {lightboxIndex !== null && (
        <Lightbox photos={day.photos} initialIndex={lightboxIndex} topic={day.topic} onClose={() => setLightboxIndex(null)} />
      )}
    </>
  );
}

function ArchiveView({
  data,
  selectedDate,
  onDateChange,
  onOpenAdmin,
}: {
  data: GalleryData;
  selectedDate: string;
  onDateChange: (date: string) => void;
  onOpenAdmin: () => void;
}) {
  const today = todayString();
  const photoDates = useMemo(
    () => data.days.map((day) => day.date).filter((date) => isPastOrToday(date, today)).sort(),
    [data.days, today],
  );
  const navigationDates = useMemo(
    () => Array.from(new Set([...photoDates, today, selectedDate])).sort(),
    [photoDates, selectedDate, today],
  );
  const day = data.days.find((item) => item.date === selectedDate);
  const previousDate = [...navigationDates].reverse().find((date) => date < selectedDate);
  const nextDate = navigationDates.find((date) => date > selectedDate);
  const selectedIndex = Math.max(0, photoDates.indexOf(selectedDate));
  const dotWindowStart = photoDates.length <= 13 ? 0 : Math.max(0, Math.min(selectedIndex - 6, photoDates.length - 13));
  const visibleDates = photoDates.slice(dotWindowStart, dotWindowStart + 13);

  return (
    <div className="site-frame">
      <header className="site-header">
        <a className="brand" href={BASE_URL} aria-label="찰캌 아카이브 첫 화면">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>찰캌 아카이브</span>
        </a>
        <button className="admin-entry" type="button" onClick={onOpenAdmin}>
          <span aria-hidden="true">⌁</span>
          관리자
        </button>
      </header>

      <main className="archive-main">
        <section className="date-section" aria-label="날짜 탐색">
          <div className="date-navigator">
            <button
              className="date-arrow"
              type="button"
              disabled={!previousDate}
              onClick={() => previousDate && onDateChange(previousDate)}
              aria-label="이전 날짜"
            >
              ‹
            </button>
            <label className="date-picker-shell">
              <span>{formatDate(selectedDate)}</span>
              <span className="calendar-glyph" aria-hidden="true">▦</span>
              <input
                className="native-date-input"
                type="date"
                value={selectedDate}
                max={today}
                onChange={(event) => onDateChange(event.target.value)}
                aria-label="날짜 직접 선택"
              />
            </label>
            <button
              className="date-arrow"
              type="button"
              disabled={!nextDate}
              onClick={() => nextDate && onDateChange(nextDate)}
              aria-label="다음 날짜"
            >
              ›
            </button>
          </div>
          <div className="date-dots" aria-label="사진이 있는 날짜 빠르게 선택">
            {visibleDates.map((date) => (
              <button
                key={date}
                type="button"
                className={date === selectedDate ? "active" : ""}
                onClick={() => onDateChange(date)}
                aria-label={`${formatDate(date)} 보기`}
                aria-current={date === selectedDate ? "date" : undefined}
                title={formatDate(date)}
              />
            ))}
          </div>
        </section>

        {day ? (
          <>
            <section className="topic-heading">
              <div>
                <p className="eyebrow">{formatShortDate(day.date)}의 주제</p>
                <h1>{day.topic}</h1>
              </div>
              <p className="photo-count">함께 나눈 사진 <strong>{day.photos.length}</strong>장</p>
            </section>
            <PhotoGallery key={day.date} day={day} />
          </>
        ) : (
          <section className="empty-state">
            <div className="empty-mark" aria-hidden="true"><span /></div>
            <p className="eyebrow">{formatShortDate(selectedDate)}</p>
            <h1>이날은 아직 조용해요</h1>
            <p>등록된 사진이 없습니다. 사진이 있는 날짜로 이동해 보세요.</p>
            {photoDates.length > 0 && (
              <button className="secondary-button" type="button" onClick={() => onDateChange(photoDates[photoDates.length - 1])}>
                가장 최근 사진 보기
              </button>
            )}
          </section>
        )}
      </main>

      <footer className="site-footer">
        <p>그날의 사진을, 언제든 다시.</p>
        <span>찰캌 아카이브</span>
      </footer>
    </div>
  );
}

function DraftCard({
  draft,
  index,
  total,
  onMove,
  onRemove,
}: {
  draft: UploadDraft;
  index: number;
  total: number;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <article className="draft-card">
      <img src={draft.previewUrl} alt={`${index + 1}번째 업로드 미리보기`} />
      <div className="draft-actions">
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="사진 순서를 앞으로">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="사진 순서를 뒤로">↓</button>
        <button type="button" className="remove-button" onClick={onRemove}>삭제</button>
      </div>
    </article>
  );
}

function AdminView({
  data,
  initialDate,
  onBack,
  onPublished,
}: {
  data: GalleryData;
  initialDate: string;
  onBack: () => void;
  onPublished: (data: GalleryData, date: string) => void;
}) {
  const today = todayString();
  const initialSafeDate = isPastOrToday(initialDate, today) ? initialDate : today;
  const initialDay = data.days.find((day) => day.date === initialSafeDate);
  const [date, setDate] = useState(initialSafeDate);
  const [topic, setTopic] = useState(initialDay?.topic || "");
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [token, setToken] = useState("");
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [commitUrl, setCommitUrl] = useState("");
  const [publishing, setPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const existingDay = data.days.find((day) => day.date === date);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!drafts.length || publishing) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [drafts.length, publishing]);

  function selectDate(nextDate: string) {
    const currentToday = todayString();
    const safeDate = isPastOrToday(nextDate, currentToday) ? nextDate : currentToday;
    setDate(safeDate);
    const day = data.days.find((item) => item.date === safeDate);
    setTopic(day?.topic || "");
  }

  function addFiles(fileList: FileList | File[]) {
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    const accepted = Array.from(fileList).filter((file) => allowedTypes.has(file.type) && file.size <= 20 * 1024 * 1024);
    if (!accepted.length) {
      setError("20MB 이하의 JPG, PNG, WebP 사진을 선택해 주세요.");
      return;
    }
    setError("");
    setCommitUrl("");
    setDrafts((current) => [
      ...current,
      ...accepted.slice(0, Math.max(0, 20 - current.length)).map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
  }

  function removeDraft(id: string) {
    setDrafts((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function moveDraft(index: number, direction: -1 | 1) {
    setDrafts((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setError("");
    setCommitUrl("");
    if (date && !isPastOrToday(date)) {
      setError("오늘 이후 날짜에는 사진을 게시할 수 없습니다.");
      return;
    }
    if (!date || !topic.trim() || !drafts.length || !token.trim()) {
      setError("날짜, 주제, 사진, GitHub 연결 토큰을 모두 확인해 주세요.");
      return;
    }
    setPublishing(true);
    try {
      const result = await publishGalleryDay({
        token: token.trim(),
        date,
        topic: topic.trim(),
        drafts,
        onProgress: setStatus,
      });
      drafts.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));
      setDrafts([]);
      setToken("");
      setStatus("게시가 끝났어요. 사이트에는 보통 1~2분 안에 반영됩니다.");
      setCommitUrl(result.commitUrl);
      onPublished(result.data, date);
    } catch (caught) {
      setStatus("");
      setError(caught instanceof Error ? caught.message : "게시 중 문제가 생겼습니다.");
    } finally {
      setPublishing(false);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  function preventSubmitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.preventDefault();
  }

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">찰캌 아카이브 ADMIN</p>
          <h1>새로운 하루를 기록해요</h1>
        </div>
        <button className="secondary-button" type="button" onClick={onBack}>아카이브로 돌아가기</button>
      </header>

      <main className="admin-main">
        <div className="admin-notice">
          <span aria-hidden="true">i</span>
          <p><strong>안전한 게시 방식</strong> 비밀번호는 관리자 화면을 여는 코드이고, 실제 게시 권한은 이 저장소에만 제한한 GitHub 토큰이 지켜줍니다. 토큰은 어디에도 저장하지 않습니다.</p>
        </div>

        <form className="admin-layout" onSubmit={publish}>
          <section className="admin-panel form-panel">
            <div className="panel-heading">
              <span>01</span>
              <div><h2>날짜와 주제</h2><p>사진을 찾기 쉽도록 하루의 이름을 붙여 주세요.</p></div>
            </div>
            <div className="field-grid">
              <label>
                <span>날짜</span>
                <input type="date" value={date} max={today} onChange={(event) => selectDate(event.target.value)} required />
              </label>
              <label>
                <span>그날의 주제</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  onKeyDown={preventSubmitOnEnter}
                  maxLength={30}
                  placeholder="예: 바다, 우리 동네, 여름밤"
                  required
                />
              </label>
            </div>
            {existingDay && <p className="existing-day">이 날짜에는 이미 “{existingDay.topic}” 사진 {existingDay.photos.length}장이 있어요. 새 사진은 이어서 추가됩니다.</p>}
            <div className="panel-divider" />

            <div className="panel-heading compact-heading">
              <span>02</span>
              <div><h2>사진 선택</h2><p>한 번에 최대 20장, 사진당 20MB까지 올릴 수 있어요.</p></div>
            </div>
            <div
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileInputRef.current?.click()}
            >
              <div className="dropzone-mark" aria-hidden="true">＋</div>
              <strong>사진을 끌어놓거나 눌러서 선택</strong>
              <span>JPG · PNG · WebP</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(event) => {
                  if (event.currentTarget.files) addFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
                tabIndex={-1}
              />
            </div>
          </section>

          <section className="admin-panel preview-panel">
            <div className="panel-heading preview-heading">
              <span>03</span>
              <div><h2>사진 미리보기</h2><p>표시 순서만 확인해 주세요.</p></div>
              <strong className="draft-count">{drafts.length}장</strong>
            </div>
            {drafts.length ? (
              <div className="draft-list">
                {drafts.map((draft, index) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    index={index}
                    total={drafts.length}
                    onMove={(direction) => moveDraft(index, direction)}
                    onRemove={() => removeDraft(draft.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="preview-empty">
                <div className="empty-mark small" aria-hidden="true"><span /></div>
                <p>선택한 사진이 여기에 보여요.</p>
              </div>
            )}
          </section>

          <section className="publish-panel">
            <div className="publish-copy">
              <p className="eyebrow">FINAL STEP</p>
              <h2>GitHub에 바로 게시</h2>
              <p>처음 한 번만 이 저장소 전용 토큰을 만든 뒤, 게시할 때 붙여 넣어 주세요. 입력값은 탭을 닫으면 사라집니다.</p>
              <details>
                <summary>처음 연결한다면</summary>
                <ol>
                  <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Fine-grained token 만들기</a>를 엽니다.</li>
                  <li>Repository access에서 <strong>Only select repositories</strong> → <strong>chalkak-prototype</strong>을 선택합니다.</li>
                  <li>Permissions → Repository permissions → <strong>Contents: Read and write</strong>만 설정합니다.</li>
                </ol>
              </details>
            </div>
            <div className="publish-actions">
              <label>
                <span>GitHub 연결 토큰</span>
                <input
                  type="password"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder="github_pat_…"
                  required
                />
              </label>
              {status && <p className="form-status" role="status">{status}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
              {commitUrl && <a className="commit-link" href={commitUrl} target="_blank" rel="noreferrer">게시 기록 확인하기 ↗</a>}
              <button className="primary-button publish-button" type="submit" disabled={publishing}>
                {publishing ? "게시하는 중…" : `${drafts.length || ""}장 게시하기`}
              </button>
            </div>
          </section>
        </form>
      </main>
    </div>
  );
}

function App() {
  const [data, setData] = useState<GalleryData | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDateFromUrl());
  const [loadingError, setLoadingError] = useState("");
  const [accessOpen, setAccessOpen] = useState(() => new URLSearchParams(window.location.search).has("admin"));
  const [adminOpen, setAdminOpen] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}data/gallery.json`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("갤러리를 불러오지 못했습니다.");
        return response.json() as Promise<GalleryData>;
      })
      .then((galleryData) => {
        const today = todayString();
        const queryDate = new URLSearchParams(window.location.search).get("date");
        setData(galleryData);
        setSelectedDate((current) => (isPastOrToday(current, today) ? current : today));
        if (queryDate && (!isPastOrToday(queryDate, today) || queryDate === today)) {
          updateQuery({ date: null }, true);
        }
      })
      .catch((error) => setLoadingError(error instanceof Error ? error.message : "갤러리를 불러오지 못했습니다."));
  }, []);

  useEffect(() => {
    if (!data) return;
    function onPopState() {
      const params = new URLSearchParams(window.location.search);
      const queryDate = params.get("date");
      const today = todayString();
      const nextDate = isPastOrToday(queryDate, today) ? queryDate : today;
      setSelectedDate(nextDate);
      if (queryDate && nextDate === today) updateQuery({ date: null }, true);
      if (!params.has("admin")) setAdminOpen(false);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [data]);

  function changeDate(date: string) {
    const today = todayString();
    const nextDate = isPastOrToday(date, today) ? date : today;
    setSelectedDate(nextDate);
    updateQuery({ date: nextDate === today ? null : nextDate });
  }

  function enterAdmin() {
    setAccessOpen(false);
    setAdminOpen(true);
    updateQuery({ admin: "1" }, true);
  }

  function leaveAdmin() {
    setAdminOpen(false);
    updateQuery({ admin: null }, true);
  }

  if (loadingError) {
    return (
      <main className="fatal-state">
        <div className="empty-mark" aria-hidden="true"><span /></div>
        <h1>잠시 사진을 불러오지 못했어요</h1>
        <p>{loadingError}</p>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>다시 불러오기</button>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-state" aria-live="polite">
        <div className="loading-mark" aria-hidden="true"><span /></div>
        <p>그날의 사진을 꺼내는 중…</p>
      </main>
    );
  }

  const activeDate = selectedDate || todayString();

  return (
    <>
      {adminOpen ? (
        <AdminView
          data={data}
          initialDate={activeDate}
          onBack={leaveAdmin}
          onPublished={(nextData, date) => {
            setData(nextData);
            setSelectedDate(date);
            updateQuery({ date: date === todayString() ? null : date }, true);
          }}
        />
      ) : (
        <ArchiveView data={data} selectedDate={activeDate} onDateChange={changeDate} onOpenAdmin={() => setAccessOpen(true)} />
      )}
      {accessOpen && !adminOpen && <AccessModal onClose={() => { setAccessOpen(false); updateQuery({ admin: null }, true); }} onSuccess={enterAdmin} />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
