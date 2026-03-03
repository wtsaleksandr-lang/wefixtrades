import { useParams } from "wouter";
import { PRODUCTS } from "@/site/siteMap";
import ProductPageTemplate from "./ProductPageTemplate";
import NotFound from "@/pages/not-found";

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const product = PRODUCTS.find((p) => p.slug === params.slug);

  if (!product) return <NotFound />;

  return <ProductPageTemplate product={product} />;
}
