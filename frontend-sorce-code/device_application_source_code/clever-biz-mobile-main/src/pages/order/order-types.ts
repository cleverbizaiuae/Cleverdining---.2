export type OrderItem = {
  item_name: string;
  quantity: number;
  price: string | number;
};

export type Order = {
  id: number;
  order_items?: OrderItem[];
  items?: OrderItem[]; // fallback key
  status: string;
  total_price: string | number;
  created_time: string;
  updated_time: string;
  device: number;
  restaurant: number;
  device_name: string;
  stripe_publishable_key: string;
};
