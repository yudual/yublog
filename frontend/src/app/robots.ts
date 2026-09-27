import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const siteUrl = (!envUrl || envUrl.includes("localhost")) ? "https://yugold.top" : envUrl;
  const baseUrl = siteUrl.replace(/\/+$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
