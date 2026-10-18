import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export const GET = POST;

export async function POST(request: NextRequest) {
  let secret: string | undefined;
  let path: string | undefined;
  let paths: string[] | undefined;

  try {
    const body = await request.json();
    secret = body?.secret;
    path = body?.path;
    paths = body?.paths;
  } catch {
    // 允许从 URL 查询参数中读取
  }

  if (!secret) {
    secret = request.nextUrl.searchParams.get("secret") || undefined;
  }
  if (!path) {
    path = request.nextUrl.searchParams.get("path") || undefined;
  }

  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ message: "Invalid secret" }, { status: 401 });
  }

  const targetPaths: string[] = [];
  if (typeof path === "string" && path) {
    targetPaths.push(path);
  }
  if (Array.isArray(paths)) {
    for (const p of paths) {
      if (typeof p === "string" && p && !targetPaths.includes(p)) {
        targetPaths.push(p);
      }
    }
  }

  // 若请求中指定了具体 path / paths，优先单独重验证
  for (const p of targetPaths) {
    try {
      revalidatePath(p);
    } catch {
      // 容错忽略个别非法路径
    }
  }

  // 全站核心内容频道与聚合页面的按需重验证
  const corePaths = [
    "/",
    "/articles",
    "/moments",
    "/projects",
    "/about",
  ];
  for (const p of corePaths) {
    try {
      revalidatePath(p, "layout");
      revalidatePath(p, "page");
    } catch {
      // 容错忽略
    }
  }

  // 同时按需失效 Next.js Data Cache 数据标签
  try {
    revalidateTag("posts", { expire: 0 });
    revalidateTag("owner", { expire: 0 });
    revalidateTag("settings", { expire: 0 });
  } catch (err) {
    console.warn("revalidateTag warning:", err);
  }


  return NextResponse.json({ revalidated: true, now: Date.now() });
}

