import type { NextConfig } from "next";

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:4000").replace(/\/+$/, "");
const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_ORIGIN
  ? new URL(process.env.NEXT_PUBLIC_MEDIA_ORIGIN).hostname
  : null;

const nextConfig: NextConfig = {
  // Pi's browser preview reaches the dev server through these host interfaces.
  // Next blocks cross-origin dev assets/HMR unless the forwarded origins are allowed.
  allowedDevOrigins: ["161.33.5.19", "10.0.0.49"],
  output: "standalone",
  staticPageGenerationTimeout: 300,
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
  images: {
    unoptimized: true,
    dangerouslyAllowLocalIP: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
      },
    ],
  },
  async headers() {
    return [
      {
        // 针对前台公开页面开启 CDN 边缘缓存（排除后台 /admin 与 API 路由）
        source: "/((?!api|admin|_next/static|_next/image).*)",
        headers: [
          {
            key: "CDN-Cache-Control",
            value: "max-age=60",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/post/:id",
        destination: "/moments/:id",
        permanent: true,
      },
      {
        source: "/posts",
        destination: "/articles",
        permanent: true,
      },
      {
        source: "/project",
        destination: "/projects",
        permanent: true,
      },
      {
        source: "/project/:id",
        destination: "/projects/:id",
        permanent: true,
      },
      {
        source: "/article",
        destination: "/articles",
        permanent: true,
      },
      {
        source: "/article/:id",
        destination: "/articles/:id",
        permanent: true,
      },
      {
        source: "/moment",
        destination: "/moments",
        permanent: true,
      },
      {
        source: "/moment/:id",
        destination: "/moments/:id",
        permanent: true,
      },
      {
        source: "/admin/music",
        destination: "/admin/settings",
        permanent: true,
      },
      {
        source: "/profile",
        destination: "/archives",
        permanent: true,
      },
      {
        source: "/archive",
        destination: "/archives",
        permanent: true,
      },
      {
        source: "/admin/project",
        destination: "/admin/projects",
        permanent: true,
      },
      {
        source: "/admin/project/:id",
        destination: "/admin/projects/:id",
        permanent: true,
      },
      {
        source: "/admin/article",
        destination: "/admin/articles",
        permanent: true,
      },
      {
        source: "/admin/article/:id",
        destination: "/admin/articles/:id",
        permanent: true,
      },
      {
        source: "/admin/post",
        destination: "/admin/posts",
        permanent: true,
      },
      {
        source: "/admin/post/:id",
        destination: "/admin/posts/:id",
        permanent: true,
      },
      {
        source: "/admin/moment",
        destination: "/admin/posts",
        permanent: true,
      },
      {
        source: "/admin/moment/:id",
        destination: "/admin/posts",
        permanent: true,
      },
      {
        source: "/admin/moments/:id",
        destination: "/admin/posts",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return {
      afterFiles: [
        {
          source: "/api/:path*",
          destination: `${BACKEND_URL}/api/:path*`,
        },
        {
          source: "/uploads/:path*",
          destination: `${BACKEND_URL}/uploads/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
