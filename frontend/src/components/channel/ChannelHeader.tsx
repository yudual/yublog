"use client";

import { ReactNode } from "react";

interface ChannelHeaderProps {
  title: string;
  subtitle: string;
  icon?: ReactNode;
  count?: number;
  maxWidth?: string;
  rightAction?: ReactNode;
}

export default function ChannelHeader({
  title,
  subtitle,
  icon,
  count,
  maxWidth = "max-w-4xl",
  rightAction,
}: ChannelHeaderProps) {
  return (
    <div className={`relative mx-auto w-full ${maxWidth} px-4 sm:px-6 pt-20 sm:pt-24 pb-6 transition-colors`}>
      <div className="flex items-center justify-between border-b border-neutral-200/70 dark:border-neutral-800/80 pb-6 gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/90 dark:bg-neutral-800/90 border border-neutral-200/80 dark:border-neutral-700/80 shadow-2xs text-neutral-700 dark:text-neutral-200 shrink-0">
                {icon}
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-50">
              {title}
            </h1>
            {typeof count === "number" && (
              <span className="rounded-md bg-neutral-100/90 dark:bg-neutral-800/90 px-2 py-0.5 text-xs font-mono font-medium text-neutral-500 dark:text-neutral-400 border border-neutral-200/50 dark:border-neutral-700/50">
                {count}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed font-normal">
            {subtitle}
          </p>
        </div>
        {rightAction && <div className="shrink-0">{rightAction}</div>}
      </div>
    </div>
  );
}
