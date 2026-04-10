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

function getWooEnv(name: "WOO_URL" | "WOO_KEY" | "WOO_SECRET") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getWooClient() {
  return new WooCommerceRestApi({
    url: getWooEnv("WOO_URL"),
    consumerKey: getWooEnv("WOO_KEY"),
    consumerSecret: getWooEnv("WOO_SECRET"),
    version: "wc/v3",
  });
}

export async function fetchAllWooProducts() {
  const woo = getWooClient();
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
