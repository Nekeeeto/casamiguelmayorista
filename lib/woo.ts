import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

export type WooProduct = {
  id: number;
  name: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  images: Array<{ src: string }>;
};

const requiredWooEnvs = ["WOO_URL", "WOO_KEY", "WOO_SECRET"] as const;

for (const envName of requiredWooEnvs) {
  if (!process.env[envName]) {
    throw new Error(`Missing required env var: ${envName}`);
  }
}

export const woo = new WooCommerceRestApi({
  url: process.env.WOO_URL!,
  consumerKey: process.env.WOO_KEY!,
  consumerSecret: process.env.WOO_SECRET!,
  version: "wc/v3",
});

export async function fetchAllWooProducts() {
  const products: WooProduct[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { data } = await woo.get("products", {
      per_page: 100,
      page,
      status: "publish",
      orderby: "date",
      order: "desc",
    });

    const batch = data as WooProduct[];
    products.push(...batch);

    hasMore = batch.length === 100;
    page += 1;

    if (page > 30) {
      break;
    }
  }

  return products;
}
