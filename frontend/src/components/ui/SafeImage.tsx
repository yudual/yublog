"use client";

import React, { useState } from "react";
import Image, { type ImageProps } from "next/image";
import { ImageIcon } from "lucide-react";

export interface SafeImageProps extends Omit<ImageProps, "onError" | "onLoad"> {
  fallbackSrc?: string;
  showErrorPlaceholder?: boolean;
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

/**
 * 具有健壮容灾机制的安全图片组件
 * - 平滑淡入（避免空白闪烁与 CLS）
 * - 错误捕获：防止因 CDN 超时/404 导致长时间呈现死灰块
 * - 优雅占位：图片无法读取时展示柔和的图示而非破图或透明空块
 */
export default function SafeImage({
  src,
  alt = "",
  className = "",
  fill = false,
  fallbackSrc,
  showErrorPlaceholder = true,
  onLoad,
  onError,
  ...rest
}: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);

  if (prevSrc !== src) {
    setPrevSrc(src);
    setCurrentSrc(src);
    setIsLoaded(false);
    setHasError(false);
    setTriedFallback(false);
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoaded(true);
    setHasError(false);
    onLoad?.(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (fallbackSrc && !triedFallback && fallbackSrc !== currentSrc) {
      setTriedFallback(true);
      setCurrentSrc(fallbackSrc);
      return;
    }
    setHasError(true);
    setIsLoaded(false);
    onError?.(e);
  };

  if (hasError && showErrorPlaceholder) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-neutral-100/90 dark:bg-neutral-800/80 text-neutral-400 dark:text-neutral-500 select-none ${
          fill ? "absolute inset-0 h-full w-full" : "min-h-[120px] w-full"
        } ${className}`}
      >
        <ImageIcon className="h-6 w-6 stroke-[1.5] opacity-60" />
        <span className="mt-1 text-[11px] font-medium tracking-tight opacity-70">
          图片暂无法加载
        </span>
      </div>
    );
  }

  return (
    <Image
      {...rest}
      src={currentSrc}
      alt={alt}
      fill={fill}
      onLoad={handleLoad}
      onError={handleError}
      className={`${className} transition-opacity duration-300 ${
        isLoaded ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
