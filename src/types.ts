export type GalleryPhoto = {
  id: string;
  src: string;
  uploadedAt?: string;
  width?: number;
  height?: number;
};

export type GalleryDay = {
  date: string;
  topic: string;
  photos: GalleryPhoto[];
};

export type GalleryData = {
  updatedAt: string;
  days: GalleryDay[];
};

export type AnalyticsDay = {
  date: string;
  visitors: number;
  views: number;
};

export type AnalyticsData = {
  configured: boolean;
  updatedAt: string | null;
  timezone: "Asia/Seoul";
  days: AnalyticsDay[];
};

export type UploadDraft = {
  id: string;
  file: File;
  previewUrl: string;
};
