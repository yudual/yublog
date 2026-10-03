import type { User } from "@/lib/types";
import { toAbsoluteUrl } from "@/lib/upload";
import { toSafeHttpUrl, toSafeImageUrl } from "@/lib/web-url";
import SpecialPageLayout from "@/components/SpecialPageLayout";

export type CatalogCollection = "equipment" | "labs";

export interface CatalogItem {
  id: string;
  title: string;
  configuration: string;
  description: string;
  imageUrl: string;
  linkUrl: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  intro: string;
  items: CatalogItem[];
}

interface CatalogPageProps {
  owner: User;
  title: string;
  description: string;
  categories: CatalogCategory[];
  showToc?: boolean;
  linkTitles?: boolean;
}

export default function CatalogPage({ owner, title, description, categories, showToc = false, linkTitles = false }: CatalogPageProps) {
  return (
    <SpecialPageLayout owner={owner} showToc={showToc}>
      <article className="px-4 pb-12 pt-4 md:px-6">
        <h1 className="text-[24px] font-medium leading-tight text-wechat-text dark:text-white md:text-[28px]">{title}</h1>
        <p className="mt-3 text-[14px] leading-6 text-wechat-time md:text-[15px]">{description}</p>

        {categories.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-black/10 px-5 py-12 text-center text-sm text-wechat-time dark:border-white/10">
            暂无内容
          </div>
        ) : (
          <div className="mt-10 space-y-10">
            {categories.map((category) => (
              <section key={category.id}>
                <h2 className="text-[19px] font-semibold text-wechat-text dark:text-white md:text-[21px]">{category.name}</h2>
                {category.intro && <p className="mt-2 text-sm leading-6 text-wechat-time">{category.intro}</p>}
                {category.items.length > 0 ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {category.items.map((item) => (
                      <div
                        key={item.id}
                        className="group overflow-hidden rounded-2xl border border-black/[0.06] bg-white shadow-[0_8px_24px_-18px_rgba(0,0,0,0.4)] transition-colors hover:bg-[#fcfcfc] dark:border-white/10 dark:bg-[#28282d] dark:hover:bg-[#303036]"
                      >
                        <div className="relative flex aspect-[16/9] items-center justify-center bg-white p-5 dark:bg-[#f7f7f7]">
                          {toSafeImageUrl(item.imageUrl) ? (
                            // 外部 URL 无法在构建期预先列入 Next Image 白名单，统一使用原生图片。
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={toAbsoluteUrl(toSafeImageUrl(item.imageUrl) || "")}
                              alt={item.title}
                              className="h-full w-full object-contain p-5"
                            />
                          ) : (
                            <span className="text-xs text-gray-400">暂无图片</span>
                          )}
                        </div>
                        <div className="p-4">
                          {linkTitles && toSafeHttpUrl(item.linkUrl) ? (
                            <a
                              href={toSafeHttpUrl(item.linkUrl) || undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[16px] font-semibold text-wechat-text transition-colors hover:text-wechat-nickname dark:text-white"
                            >
                              {item.title}
                            </a>
                          ) : (
                            <h3 className="text-[16px] font-semibold text-wechat-text dark:text-white">{item.title}</h3>
                          )}
                          {item.configuration && <p className="mt-1 text-[12px] text-wechat-time">{item.configuration}</p>}
                          {item.description && <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-wechat-text-secondary dark:text-gray-300">{item.description}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-wechat-time">暂未添加内容</p>
                )}
              </section>
            ))}
          </div>
        )}
      </article>
    </SpecialPageLayout>
  );
}
