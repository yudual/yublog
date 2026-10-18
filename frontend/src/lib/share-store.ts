import { create } from "zustand";

export interface ShareData {
  title: string;
  url: string;
  typeLabel?: string; // "文章" | "系列合辑" | "项目作品" | "动态随笔"
  summary?: string;
  cover?: string;
  author?: string;
  date?: string;
  category?: string;
  readingTime?: number;
  totalArticles?: number;
}

interface ShareStore {
  isOpen: boolean;
  data: ShareData | null;
  openShare: (data: ShareData) => void;
  closeShare: () => void;
}

export const useShareStore = create<ShareStore>((set) => ({
  isOpen: false,
  data: null,
  openShare: (data) => set({ isOpen: true, data }),
  closeShare: () => set({ isOpen: false, data: null }),
}));
