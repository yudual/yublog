"use client";

import { useState, useRef, useEffect } from "react";
import { Heart, MessageSquare, Pencil, Trash2, Pin, PinOff, Share2 } from "lucide-react";

interface ActionMenuProps {
  onLike?: () => void;
  onComment?: () => void;
  onShare?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  liked?: boolean;
  pinned?: boolean;
}

export default function ActionMenu({
  onLike,
  onComment,
  onShare,
  onEdit,
  onDelete,
  onPin,
  liked = false,
  pinned = false,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 管理员登录后菜单项多（赞/评论/分享/置顶/编辑/删除），手机端需要紧凑布局
  // 访客时只有赞/评论/分享，用稍大舒适尺寸
  const isFullMenu = !!(onPin || onEdit || onDelete);
  const itemCls = isFullMenu
    ? "flex h-full items-center gap-1.5 whitespace-nowrap px-2.5 md:gap-1.5 md:px-3 text-[12px] md:text-[13px] font-medium text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all cursor-pointer"
    : "flex h-full items-center gap-1.5 md:gap-2 whitespace-nowrap px-3 md:px-3.5 text-[12px] md:text-[13px] font-medium text-white/90 hover:text-white hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all cursor-pointer";
  const iconCls = isFullMenu
    ? "h-3.5 w-3.5 md:h-[15px] md:w-[15px]"
    : "h-3.5 w-3.5 md:h-4 md:w-4";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("touchstart", onPointerDown, { passive: true });
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  const Divider = () => <div className="h-3.5 w-px bg-white/15" />;

  // 无任何可用操作时不显示按钮
  if (!onLike && !onComment && !onShare && !onPin && !onEdit && !onDelete) return null;

  return (
    <div className="relative" ref={containerRef}>
      {/* 两个点操作胶囊按钮 */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex h-6 w-8 items-center justify-center rounded-lg bg-neutral-100/90 dark:bg-neutral-800/80 border border-neutral-200/70 dark:border-neutral-700/60 shadow-2xs hover:shadow-xs hover:bg-neutral-200/70 dark:hover:bg-neutral-700/80 hover:border-neutral-300 dark:hover:border-neutral-600 active:scale-90 transition-all duration-150 cursor-pointer before:absolute before:-inset-2 before:content-['']"
        aria-label="操作"
      >
        <span className="flex items-center gap-1 transition-transform duration-150 group-hover:scale-110">
          <span className="h-1 w-1 rounded-full bg-neutral-500 dark:bg-neutral-400 group-hover:bg-neutral-800 dark:group-hover:bg-white transition-colors" />
          <span className="h-1 w-1 rounded-full bg-neutral-500 dark:bg-neutral-400 group-hover:bg-neutral-800 dark:group-hover:bg-white transition-colors" />
        </span>
      </button>

      {/* 弹出菜单：赞 / 评论 / 分享 / 置顶 / 编辑 / 删除 — 高阶毛玻璃黑曜石胶囊 */}
      {open && (
        <div className="absolute right-full top-1/2 z-20 mr-2 flex h-8.5 sm:h-9 origin-right -translate-y-1/2 items-center overflow-hidden rounded-xl bg-neutral-900/95 dark:bg-neutral-850/95 text-white/90 backdrop-blur-md border border-white/10 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.4),0_4px_10px_-2px_rgba(0,0,0,0.2)] animate-pop-in">
          {(() => {
            const items: React.ReactNode[] = [];
            if (onLike) {
              items.push(
                <button
                  key="like"
                  type="button"
                  onClick={() => {
                    onLike();
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  <Heart
                    className={`${iconCls} ${liked ? "text-red-500" : ""}`}
                    fill={liked ? "currentColor" : "none"}
                    strokeWidth={1.8}
                  />
                  <span>{liked ? "取消" : "赞"}</span>
                </button>
              );
            }
            if (onComment) {
              items.push(
                <button
                  key="comment"
                  type="button"
                  onClick={() => {
                    onComment();
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  <MessageSquare className={iconCls} strokeWidth={1.8} />
                  <span>评论</span>
                </button>
              );
            }
            if (onShare) {
              items.push(
                <button
                  key="share"
                  type="button"
                  onClick={() => {
                    onShare();
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  <Share2 className={iconCls} strokeWidth={1.8} />
                  <span>分享</span>
                </button>
              );
            }
            if (onPin) {
              items.push(
                <button
                  key="pin"
                  type="button"
                  onClick={() => {
                    onPin();
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  {pinned ? (
                    <PinOff className={iconCls} strokeWidth={1.8} />
                  ) : (
                    <Pin className={iconCls} strokeWidth={1.8} />
                  )}
                  <span>{pinned ? "取消置顶" : "置顶"}</span>
                </button>
              );
            }
            if (onEdit) {
              items.push(
                <button
                  key="edit"
                  type="button"
                  onClick={() => {
                    onEdit();
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  <Pencil className={iconCls} strokeWidth={1.8} />
                  <span>编辑</span>
                </button>
              );
            }
            if (onDelete) {
              items.push(
                <button
                  key="delete"
                  type="button"
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                  }}
                  className={itemCls}
                >
                  <Trash2 className={iconCls} strokeWidth={1.8} />
                  <span>删除</span>
                </button>
              );
            }
            return items.map((item, idx) => (
              <div key={idx} className="flex h-full items-center">
                {idx > 0 && <Divider />}
                {item}
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
