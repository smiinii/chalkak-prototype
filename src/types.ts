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

export type UploadDraft = {
  id: string;
  file: File;
  previewUrl: string;
};
