export type OrderStage = "Pending" | "Preparing" | "Served";

export type OrderItem = {
  id?: string | number;
  item_id?: string | number;
  item_name?: string;
  name?: string;
  quantity: number;
  price: string | number;
  orderId?: string;
  key?: string;
};

export type Order = {
  id: string | number;
  backendId?: string;
  order_items?: OrderItem[];
  items?: OrderItem[];
  total?: number;
  total_price?: string | number;
  amountPaid?: string | number;
  amount_paid?: string | number;
  remainingAmount?: string | number;
  remaining_amount?: string | number;
  isFullyPaid?: boolean;
  is_fully_paid?: boolean;
  isPartiallyPaid?: boolean;
  is_partially_paid?: boolean;
  bill_payment_status?: string;
  payment_progress?: string | number;
  status: OrderStage | string;
  backendStatus?: string;
  paymentStatus?: "Paid" | "Unpaid";
  payment_status?: string;
  timestamp?: string;
  created_time?: string;
  updated_time?: string;
  device?: number;
  restaurant?: number;
  device_name?: string;
  stripe_publishable_key?: string;
  shouldRemove?: boolean;
};
