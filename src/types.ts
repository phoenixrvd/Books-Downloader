export interface MetadataField {
  label: string;
  value: string;
}

export interface Book {
  id: string;
  author: string;
  title: string;
  description: string;
  metadata: string[];
  metadataFields?: MetadataField[];
  image?: string;
  source?: string;
  files: string[];
}

export interface PageState {
  bookId?: string;
  content?: Book | null;
  jobId?: string;
  pending?: number;
  loading?: boolean;
  error?: string;
  message?: string;
  failures?: { filename: string; reason: string }[];
  stale?: boolean;
}

export type PopupMessage = {
  type: "getState" | "download" | "refresh";
  tabId: number;
};

export type BackgroundMessage =
  PopupMessage | { type: "bookState"; result: PageState };
export interface DownloadOptions {
  url: string;
  filename: string;
  conflictAction: "overwrite" | "uniquify" | "prompt";
  saveAs: boolean;
}
export interface QueueEntry {
  tabId: number;
  jobId?: string;
  options: DownloadOptions;
}
export interface DownloadOwner {
  tabId: number;
  jobId?: string;
  filename?: string;
}

export interface SavedState {
  queue?: QueueEntry[];
  activeDownloads?: Record<number, DownloadOwner | number>;
  states?: Record<number, PageState>;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
