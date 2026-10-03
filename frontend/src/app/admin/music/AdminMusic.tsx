"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Music, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { toAbsoluteUrl } from "@/lib/upload";
import { toSafeImageUrl } from "@/lib/web-url";
import MusicTrackForm, { type EditableTrack } from "@/components/admin/MusicTrackForm";

function notifyPlaylistUpdated() {
  window.dispatchEvent(new CustomEvent("music-playlist-updated"));
}

export default function AdminMusic() {
  const [name, setName] = useState("网站歌单");
  const [tracks, setTracks] = useState<EditableTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoplay, setAutoplay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<EditableTrack | null>(null);
  const orderInFlight = useRef(false);
  const pendingOrder = useRef<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch("/music/admin", { cache: "no-store" });
      if (!response.ok) throw new Error("加载歌单失败");
      const data = await response.json();
      setName(data.name || "网站歌单");
      setTracks(data.tracks || []);
      setAutoplay(data.musicAutoplay || false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载歌单失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const flushOrder = useCallback(async () => {
    if (orderInFlight.current) return;
    orderInFlight.current = true;
    setOrdering(true);
    let failed = false;
    try {
      while (pendingOrder.current) {
        const trackIds = pendingOrder.current;
        pendingOrder.current = null;
        const response = await apiFetch("/music/admin/order", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trackIds }),
        });
        if (!response.ok) {
          failed = true;
          pendingOrder.current = null;
          break;
        }
      }
    } finally {
      orderInFlight.current = false;
      setOrdering(false);
    }
    if (failed) {
      setMessage("保存排序失败，已重新加载歌单");
      await load();
    } else {
      notifyPlaylistUpdated();
    }
  }, [load]);

  const move = (index: number, direction: -1 | 1) => {
    setTracks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      pendingOrder.current = next.map((track) => track.id);
      queueMicrotask(() => void flushOrder());
      return next;
    });
  };

  const removeTrack = async (id: string) => {
    if (!confirm("仅从歌单移除此歌曲，不会删除 R2 文件。继续吗？")) return;
    const response = await apiFetch(`/music/admin/tracks/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setMessage(data?.message || "移除歌曲失败");
      return;
    }
    setTracks((current) => current.filter((track) => track.id !== id));
    if (editing?.id === id) setEditing(null);
    notifyPlaylistUpdated();
  };

  const savePlaylist = async () => {
    setSaving(true);
    try {
      const response = await apiFetch("/music/admin", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, musicAutoplay: autoplay }),
      });
      if (!response.ok) throw new Error("保存歌单设置失败");
      setMessage("歌单设置已保存");
      notifyPlaylistUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaved = (track: EditableTrack) => {
    setTracks((current) => {
      const exists = current.some((item) => item.id === track.id);
      return exists ? current.map((item) => item.id === track.id ? track : item) : [...current, track];
    });
    setEditing(null);
    notifyPlaylistUpdated();
  };

  return <div className="mx-auto max-w-4xl p-4 sm:p-6">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold text-adm-text">R2 音乐歌单</h1><p className="mt-1 text-sm text-adm-text-tertiary">浏览器直传 Cloudflare R2；前台音频直接请求 R2 公网地址，不经过 Vercel 函数。</p></div>
      <button
        type="button"
        onClick={() => void savePlaylist()}
        disabled={saving}
        className="adm-btn adm-btn--primary"
      >
        <Save className="h-4 w-4" />
        <span>保存歌单</span>
      </button>
    </div>
    {message && <p className="mb-4 rounded-lg bg-adm-input px-3 py-2 text-sm text-adm-text-secondary">{message}</p>}
    <section className="mb-6 rounded-xl border border-adm-border bg-adm-card p-4">
      <label className="mb-1.5 block text-sm font-medium text-adm-text">歌单名称</label>
      <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-adm-border bg-adm-input px-3 py-2 text-sm text-adm-text" />
      <label className="mt-4 flex cursor-pointer items-center justify-between rounded-lg bg-adm-input px-3 py-2 text-sm text-adm-text"><span>进入网站尝试自动播放</span><input type="checkbox" checked={autoplay} onChange={(event) => setAutoplay(event.target.checked)} className="h-4 w-4 accent-adm-primary" /></label>
    </section>
    <section className="mb-6 rounded-xl border border-adm-border bg-adm-card p-4">
      <h2 className="mb-4 flex items-center gap-2 font-semibold text-adm-text">{editing ? <><Pencil className="h-4 w-4" />编辑歌曲</> : <><Plus className="h-4 w-4" />添加 R2 音频</>}</h2>
      <MusicTrackForm track={editing} onSaved={handleSaved} onCancel={editing ? () => setEditing(null) : undefined} />
    </section>
    <section className="rounded-xl border border-adm-border bg-adm-card p-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-adm-text">歌曲列表</h2>{ordering && <span className="text-xs text-adm-text-tertiary">正在保存排序…</span>}</div>
      {loading ? <p className="text-sm text-adm-text-tertiary">加载中...</p> : tracks.length === 0 ? <p className="py-8 text-center text-sm text-adm-text-tertiary">歌单为空，请添加 R2 音频文件。</p> : <div className="space-y-2">{tracks.map((track, index) => { const cover = toSafeImageUrl(track.cover); return <div key={track.id} className="flex items-center gap-3 rounded-lg bg-adm-input p-2"><GripVertical className="h-4 w-4 text-adm-text-tertiary" />{cover ? <img src={toAbsoluteUrl(cover)} alt="" className="h-10 w-10 rounded object-cover" /> : <Music className="h-8 w-8 p-2 text-adm-text-tertiary" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-adm-text">{track.name}</p><p className="truncate text-xs text-adm-text-tertiary">{track.artist || "未知艺术家"}{track.lyricMediaId ? " · R2 歌词" : track.lrc ? " · 内联歌词" : ""}</p></div><div className="flex items-center gap-1.5 shrink-0"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="adm-icon-btn h-8 w-8 min-h-8 min-w-8" title="上移" aria-label="上移"><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" onClick={() => move(index, 1)} disabled={index === tracks.length - 1} className="adm-icon-btn h-8 w-8 min-h-8 min-w-8" title="下移" aria-label="下移"><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setEditing(track)} className="adm-icon-btn h-8 w-8 min-h-8 min-w-8" title="编辑歌曲" aria-label="编辑歌曲"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void removeTrack(track.id)} className="adm-icon-btn adm-icon-btn--danger h-8 w-8 min-h-8 min-w-8" title="移除歌曲" aria-label="移除歌曲"><Trash2 className="h-3.5 w-3.5" /></button></div></div>; })}</div>}
    </section>
  </div>;
}
