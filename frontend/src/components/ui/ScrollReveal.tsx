"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface ScrollRevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "fade";
}

/**
 * ScrollReveal 组件：实现标准的 Scroll-triggered (滚动触发) 卡片渐现与轻度悬浮进场动效
 *
 * 核心特性：
 * 1. IntersectionObserver 视口边界触发，达到阈值时播放微动效
 * 2. 触发一次后立即 unobserve 释放监听，保证零持续渲染与内存开销
 * 3. 尊重系统的 prefers-reduced-motion 无障碍偏好设置，开启时直接呈现
 * 4. 采用微质感减速曲线 (Apple / Linear 风格 cubic-bezier)，丝滑克制不突兀
 */
export default function ScrollReveal({
  children,
  delay = 0,
  className = "",
  direction = "up",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // 无障碍减弱动态效果支持
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setRevealed(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.unobserve(entry.target);
          }
        }
      },
      {
        threshold: 0.08,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const transformStyle =
    direction === "up"
      ? revealed
        ? "translate-y-0"
        : "translate-y-5"
      : "";

  return (
    <div
      ref={ref}
      style={{
        transitionDuration: "600ms",
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        transitionDelay: `${Math.min(delay, 250)}ms`,
      }}
      className={`transform-gpu transition-all ${
        revealed ? "opacity-100" : "opacity-0"
      } ${transformStyle} ${className}`}
    >
      {children}
    </div>
  );
}
