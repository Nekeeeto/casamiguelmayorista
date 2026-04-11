export type WholesaleProductRecord = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  is_active: boolean;
  min_quantity: number;
  custom_price: number | null;
};

export type WooProductCacheRecord = {
  woo_product_id: number;
  sku: string | null;
  name: string;
  base_price: number;
  image_url: string | null;
  status: string;
  woo_updated_at: string | null;
  synced_at: string;
  categoria_ids?: number[];
  ventas_web?: number;
};

export type AdminProduct = {
  id: number;
  name: string;
  sku: string;
  base_price: number;
  image: string | null;
  woo_updated_at: string | null;
  synced_at: string | null;
  is_active: boolean;
  min_quantity: number;
  custom_price: number | null;
};
