import type { GalleryData, GalleryDay, GalleryPhoto, UploadDraft } from "./types";

const API_ROOT = "https://api.github.com";
const OWNER = "smiinii";
const REPO = "chalkak-prototype";
const BRANCH = "main";

type GitHubRef = { object: { sha: string } };
type GitHubCommit = { sha: string; tree: { sha: string } };
type GitHubBlob = { sha: string };
type GitHubTree = { sha: string };
type GitHubContent = { content: string; encoding: string };

function tokenHeaders(token: string) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10",
  };
}

async function githubRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      ...tokenHeaders(token),
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    const message = payload.message || `GitHub 요청에 실패했습니다. (${response.status})`;
    if (response.status === 401) throw new Error("토큰을 확인해 주세요. 유효하지 않거나 만료되었습니다.");
    if (response.status === 403) throw new Error(`게시 권한 또는 저장소 규칙을 확인해 주세요. ${message}`);
    if (response.status === 404) throw new Error("저장소 또는 main 브랜치를 찾지 못했습니다.");
    if (response.status === 409) throw new Error("다른 변경이 먼저 게시되었습니다. 새로고침 후 다시 시도해 주세요.");
    if (response.status === 422) throw new Error(`GitHub가 변경을 받지 못했습니다. ${message}`);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function textToBase64(text: string) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToText(value: string) {
  const clean = value.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function createImageBitmapSafe(file: File) {
  if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했습니다."));
    };
    image.src = url;
  });
}

async function optimizeImage(file: File) {
  const image = await createImageBitmapSafe(file);
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const maximumEdge = 1920;
  const scale = Math.min(1, maximumEdge / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("이미지 변환을 시작하지 못했습니다.");
  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("이미지를 WebP로 변환하지 못했습니다."))),
      "image/webp",
      0.84,
    );
  });

  return { blob, width, height };
}

function mergeDay(data: GalleryData, day: GalleryDay): GalleryData {
  const index = data.days.findIndex((item) => item.date === day.date);
  const days = [...data.days];
  if (index >= 0) {
    days[index] = {
      ...days[index],
      topic: day.topic,
      photos: [...days[index].photos, ...day.photos],
    };
  } else {
    days.push(day);
  }
  days.sort((a, b) => b.date.localeCompare(a.date));
  return { updatedAt: new Date().toISOString(), days };
}

async function createBlob(token: string, content: string, encoding: "utf-8" | "base64") {
  return githubRequest<GitHubBlob>(token, `/repos/${OWNER}/${REPO}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content, encoding }),
  });
}

export async function publishGalleryDay({
  token,
  date,
  topic,
  drafts,
  onProgress,
}: {
  token: string;
  date: string;
  topic: string;
  drafts: UploadDraft[];
  onProgress?: (message: string) => void;
}) {
  onProgress?.("저장소의 최신 내용을 확인하고 있어요…");
  const ref = await githubRequest<GitHubRef>(token, `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const commit = await githubRequest<GitHubCommit>(token, `/repos/${OWNER}/${REPO}/git/commits/${headSha}`);
  const content = await githubRequest<GitHubContent>(
    token,
    `/repos/${OWNER}/${REPO}/contents/public/data/gallery.json?ref=${encodeURIComponent(headSha)}`,
  );
  if (content.encoding !== "base64") throw new Error("갤러리 데이터를 읽지 못했습니다.");
  const remoteData = JSON.parse(base64ToText(content.content)) as GalleryData;

  const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
  const photos: GalleryPhoto[] = [];

  for (let index = 0; index < drafts.length; index += 1) {
    onProgress?.(`사진을 준비하고 있어요… ${index + 1}/${drafts.length}`);
    const draft = drafts[index];
    const optimized = await optimizeImage(draft.file);
    const buffer = new Uint8Array(await optimized.blob.arrayBuffer());
    const blob = await createBlob(token, bytesToBase64(buffer), "base64");
    const id = `${date}-${Date.now().toString(36)}-${index}-${crypto.randomUUID().slice(0, 6)}`;
    const path = `public/photos/${date}/${id}.webp`;
    treeEntries.push({ path, mode: "100644", type: "blob", sha: blob.sha });
    photos.push({
      id,
      src: `photos/${date}/${id}.webp`,
      uploadedAt: new Date().toISOString(),
      width: optimized.width,
      height: optimized.height,
    });
  }

  onProgress?.("날짜와 주제를 정리하고 있어요…");
  const nextData = mergeDay(remoteData, { date, topic, photos });
  const jsonBlob = await createBlob(token, textToBase64(`${JSON.stringify(nextData, null, 2)}\n`), "base64");
  treeEntries.push({ path: "public/data/gallery.json", mode: "100644", type: "blob", sha: jsonBlob.sha });

  onProgress?.("새 사진을 한 번에 게시하고 있어요…");
  const tree = await githubRequest<GitHubTree>(token, `/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: commit.tree.sha, tree: treeEntries }),
  });
  const nextCommit = await githubRequest<GitHubCommit>(token, `/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `사진 게시: ${date} ${topic} (${drafts.length}장)`,
      tree: tree.sha,
      parents: [headSha],
    }),
  });
  await githubRequest<GitHubRef>(token, `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    body: JSON.stringify({ sha: nextCommit.sha, force: false }),
  });

  return {
    data: nextData,
    commitUrl: `https://github.com/${OWNER}/${REPO}/commit/${nextCommit.sha}`,
  };
}
