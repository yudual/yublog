import type { MetadataRoute } from "next";
import { getApiUrl } from "@/lib/api-fetch";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const siteUrl = ((!envUrl || envUrl.includes("localhost")) ? "https://yugold.top" : envUrl).replace(/\/+$/, "");
  const now = new Date();

  // 基础静态路由
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/articles`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/moments`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/archives`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/projects`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // 尝试拉取已发布的公开文章与动态加入 sitemap
  try {
    const res = await fetch(`${getApiUrl()}/posts?limit=500&page=1`, {
      next: { revalidate: 3600, tags: ["posts"] },
    });
    if (res.ok) {
      const json = await res.json();
      const posts: Array<{ id: string; shortId?: string; updatedAt?: string; createdAt?: string; type?: string }> =
        Array.isArray(json?.data) ? json.data : [];

      const postRoutes: MetadataRoute.Sitemap = posts.map((p) => {
        const id = p.shortId || p.id;
        const routePrefix = p.type === "article" ? "articles" : "moments";
        return {
          url: `${siteUrl}/${routePrefix}/${id}`,
          lastModified: p.updatedAt ? new Date(p.updatedAt) : p.createdAt ? new Date(p.createdAt) : now,
          changeFrequency: "weekly",
          priority: p.type === "article" ? 0.8 : 0.6,
        };
      });

      return [...staticRoutes, ...postRoutes];
    }
  } catch {
    // 降级使用静态路由
  }

  return staticRoutes;
}
