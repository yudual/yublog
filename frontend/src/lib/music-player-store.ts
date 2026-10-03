import { create } from "zustand";
import { toAbsoluteUrl } from "./upload";
import { toSafeHttpUrl } from "./web-url";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

/** Returns a durable R2/public URL. No external source is resolved in the browser. */
export function getStaticMusicUrl(music: { url?: string; mp3url?: string }): string {
  const raw = typeof (music.url || music.mp3url) === "string" ? (music.url || music.mp3url || "").trim() : "";
  if (!raw) return "";
  const external = toSafeHttpUrl(raw);
  if (external) return external;
  const local = toAbsoluteUrl(raw);
  if (!local.startsWith("/")) return "";
  return `${API_URL.replace(/\/api$/, "")}${local}`;
}

/** Dynamic/article music is always a static R2-backed audio item. */
export interface PostMusicInfo {
  postId: string;
  url: string;
  name: string;
  artist: string;
  cover: string;
  lrc?: string;
  lyric?: string;
}

/** Static R2 playlist item. */
export interface PlaylistTrack {
  id: string;
  name: string;
  artist: string;
  cover: string;
  mp3url: string;
  lyric: string;
  lrc?: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

interface MusicPlayerState {
  activePostId: string | null;
  activePostMusic: PostMusicInfo | null;
  bgMusic: PostMusicInfo | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentLyric: string;
  playlist: PlaylistTrack[];
  currentIndex: number;
  musicUrl: string;
  musicName: string;
  musicId: string;
  lyric: LyricLine[] | null;
  currentLyricIndex: number;
  showLyricPanel: boolean;
  muted: boolean;
  audioError: boolean;
  audioErrorMessage: string;
  musicLoaded: boolean;
  switching: boolean;
  setActive: (postId: string, music: PostMusicInfo) => void;
  clear: () => void;
  setBgMusic: (music: PostMusicInfo | null) => void;
  setPlaying: (playing: boolean) => void;
  setLoading: (loading: boolean) => void;
  setCurrentLyric: (lyric: string) => void;
  initMusic: (data: {
    mp3url: string;
    name: string;
    id: string;
    lyric: LyricLine[] | null;
    playlist: PlaylistTrack[];
    currentIndex: number;
  }) => void;
  replacePlaylist: (playlist: PlaylistTrack[], preferredTrackId?: string) => void;
  prepareTrack: (index: number) => { track: PlaylistTrack; url: string } | null;
  setLyric: (lyric: LyricLine[] | null) => void;
  setCurrentLyricIndex: (index: number) => void;
  setShowLyricPanel: (show: boolean) => void;
  setMuted: (muted: boolean) => void;
  setAudioError: (error: boolean, message?: string) => void;
  setSwitching: (switching: boolean) => void;
}

export const useMusicPlayer = create<MusicPlayerState>((set, get) => ({
  activePostId: null,
  activePostMusic: null,
  bgMusic: null,
  isPlaying: false,
  isLoading: false,
  currentLyric: "",
  playlist: [],
  currentIndex: 0,
  musicUrl: "",
  musicName: "",
  musicId: "",
  lyric: null,
  currentLyricIndex: -1,
  showLyricPanel: false,
  muted: false,
  audioError: false,
  audioErrorMessage: "",
  musicLoaded: false,
  switching: false,
  setActive: (postId, music) => set({
    activePostId: postId,
    activePostMusic: music,
    switching: true,
    audioError: false,
    audioErrorMessage: "",
    currentLyric: "",
    currentLyricIndex: -1,
  }),
  clear: () => set({
    activePostId: null,
    activePostMusic: null,
    isPlaying: false,
    isLoading: false,
    switching: false,
    audioError: false,
    audioErrorMessage: "",
    currentLyric: "",
    currentLyricIndex: -1,
  }),
  setBgMusic: (music) => set({ bgMusic: music, currentLyric: "" }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setLoading: (loading) => set({ isLoading: loading }),
  setCurrentLyric: (currentLyric) => set({ currentLyric }),
  initMusic: (data) => {
    if (get().musicLoaded) return;
    const hasActivePost = !!get().activePostMusic;
    set({
      musicUrl: data.mp3url,
      musicName: data.name,
      musicId: data.id,
      lyric: hasActivePost ? get().lyric : data.lyric,
      playlist: data.playlist,
      currentIndex: data.currentIndex,
      musicLoaded: true,
      switching: false,
    });
  },
  replacePlaylist: (playlist, preferredTrackId) => {
    const currentId = preferredTrackId || get().musicId;
    const matchingIndex = playlist.findIndex((track) => track.id === currentId);
    const currentIndex = matchingIndex >= 0 ? matchingIndex : Math.min(get().currentIndex, Math.max(0, playlist.length - 1));
    const track = playlist[currentIndex];
    set({
      playlist,
      currentIndex,
      musicUrl: track?.mp3url || "",
      musicName: track?.name || "",
      musicId: track?.id || "",
      musicLoaded: true,
      switching: false,
      audioError: false,
      audioErrorMessage: "",
    });
  },
  prepareTrack: (index) => {
    const track = get().playlist[index];
    if (!track?.mp3url) {
      set({ switching: false, isLoading: false, audioError: true, audioErrorMessage: "该歌曲的 R2 音频文件不可用。" });
      return null;
    }
    set({
      currentIndex: index,
      musicUrl: track.mp3url,
      musicName: track.name,
      musicId: track.id,
      lyric: null,
      currentLyric: "",
      currentLyricIndex: -1,
      audioError: false,
      audioErrorMessage: "",
    });
    return { track, url: track.mp3url };
  },
  setLyric: (lyric) => set({ lyric }),
  setCurrentLyricIndex: (currentLyricIndex) => set({ currentLyricIndex }),
  setShowLyricPanel: (showLyricPanel) => set({ showLyricPanel }),
  setMuted: (muted) => set({ muted }),
  setAudioError: (audioError, message = "") => set({ audioError, audioErrorMessage: audioError ? message : "" }),
  setSwitching: (switching) => set({ switching }),
}));
