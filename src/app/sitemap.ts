import type { MetadataRoute } from "next";

const SITE_URL = "https://web-portofolio-rag.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/profile", "/projects", "/about"].map((path) => ({ url: `${SITE_URL}${path}` }));
}
