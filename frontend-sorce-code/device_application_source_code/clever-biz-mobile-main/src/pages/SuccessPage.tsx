/* eslint-disable no-unsafe-optional-chaining */
import { useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import axiosInstance from "../lib/axios";
import { useCart } from "../context/CartContext";

type StripeLikeCustomerDetails = {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  address?: {
    city?: string | null;
    country?: string | null;
    line1?: string | null;
    line2?: string | null;
    postal_code?: string | null;
    state?: string | null;
  } | null;
};

type PaymentInfo = {
  id?: string | null;
  amount_total?: number | null;
  amount_subtotal?: number | null;
  currency?: string | null;
  payment_status?: string | null; // 'paid' | 'unpaid' | ...
  status?: string | null; // 'open' | 'complete' | 'expired'
  created?: number | null; // unix seconds
  customer_details?: StripeLikeCustomerDetails | null;
  presentment_details?: {
    presentment_amount?: number | null;
    presentment_currency?: string | null;
  } | null;

  // optional extras if your API includes them
  transaction_id?: string | null;
  receipt_url?: string | null;
  card_brand?: string | null;
  card_last4?: string | null;
};

export default function SuccessPage() {
  const [params] = useSearchParams();

  const directSessionId = params.get("session_id");
  const orderId = params.get("order_id") || undefined;
  const rawUrlParam = params.get("url") || params.get("session_url");

  const sessionId = useMemo(() => {
    if (directSessionId) return directSessionId;
    if (rawUrlParam) {
      try {
        const u = new URL(rawUrlParam);
        return u.searchParams.get("session_id") || null;
      } catch {
        return null;
      }
    }
    return null;
  }, [directSessionId, rawUrlParam]);

  const calledRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<PaymentInfo | null>(null);

  // helpers
  const formatMoney = (
    amountMinor?: number | null,
    currency?: string | null
  ) => {
    if (amountMinor == null) return "—";
    const curr = (currency || "usd").toUpperCase();
    const value = amountMinor / 100;
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: curr,
        currencyDisplay: "narrowSymbol",
      }).format(value);
    } catch {
      return `${value} ${curr}`;
    }
  };

  const formatDate = (unix?: number | null) => {
    if (!unix) return "—";
    return new Date(unix * 1000).toLocaleString();
  };

  const short = (id?: string | null, n = 10) => {
    if (!id) return "—";
    return id.length > n ? `${id.slice(0, n)}…` : id;
  };

  const extractPaymentInfo = (data: any): PaymentInfo => {
    const s = data?.session ?? data;
    const pi = s?.payment_intent ?? data?.payment_intent;
    const piObj = typeof pi === "string" ? undefined : pi;
    const piId = typeof pi === "string" ? pi : pi?.id;
    const charge = piObj?.charges?.data?.[0] || s?.charge || data?.charge;
    const receipt_url = charge?.receipt_url || data?.receipt_url || null;
    const card = charge?.payment_method_details?.card;

    return {
      id: s?.id ?? data?.id ?? null,
      amount_total: s?.amount_total ?? data?.amount_total ?? null,
      amount_subtotal: s?.amount_subtotal ?? data?.amount_subtotal ?? null,
      currency: s?.currency ?? data?.currency ?? null,
      payment_status: s?.payment_status ?? data?.payment_status ?? null,
      status: s?.status ?? data?.status ?? null,
      created: s?.created ?? data?.created ?? null,
      customer_details: s?.customer_details ?? data?.customer_details ?? null,
      presentment_details:
        s?.presentment_details ?? data?.presentment_details ?? null,
      transaction_id: charge?.id || piId || null,
      receipt_url,
      card_brand: card?.brand || null,
      card_last4: card?.last4 || null,
    };
  };

  // auto call success API once
  const { clearCart } = useCart(); // Access clearCart from context

  useEffect(() => {
    const run = async () => {
      if (!sessionId || calledRef.current) return;
      calledRef.current = true;
      try {
        const res = await axiosInstance.get(`/api/customer/payment/success/`, {
          params: {
            session_id: sessionId,
            ...(orderId ? { order_id: orderId } : {}),
          },
        });
        setPayment(extractPaymentInfo(res?.data));
        // Clear cart on successful payment verification
        if (res?.data) {
          clearCart();
        }
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [sessionId, orderId, clearCart]); // Add clearCart to dep array

  return (
    <main className="p-4 sm:p-6 md:p-4 mx-auto max-w-4xl   overflow-y-auto h-[90vh] ">
      <header className="text-center">
        <h1 className="text-md md:text-sm xl:text-2xl font-bold text-gray-900">
          Payment Details
        </h1>
        <small className="block mt-1 text-gray-500 text">
          A summary of your transaction.
        </small>
      </header>

      {/* SUMMARY */}
      <section className="mt-6 grid gap-2 md:grid-cols-1">
        <article className="col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm p-5 md:mb-25 mb-20">
          <h2 className="text-base font-semibold text-gray-900">Summary</h2>
          {/* <small className="block mt-1 text-gray-500">
            Pulled from your payment confirmation.
          </small> */}

          <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Paid at</dt>
              <dd className="font-medium flex">
                {loading ? "…" : formatDate(payment?.created)}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-gray-500">Amount</dt>
              <dd className="xl:text-xl text-md font-bold">
                {loading
                  ? "…"
                  : formatMoney(payment?.amount_total, payment?.currency)}
              </dd>
            </div>

            {payment?.presentment_details?.presentment_amount != null && (
              <>
                <div>
                  <dt className="text-gray-500">Presentment Amount</dt>
                  <dd className="font-medium">
                    {formatMoney(
                      payment.presentment_details.presentment_amount,
                      payment.presentment_details.presentment_currency ||
                      payment.currency
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Presentment Currency</dt>
                  <dd className="font-medium">
                    {(
                      payment.presentment_details.presentment_currency || "—"
                    )?.toUpperCase?.() ?? "—"}
                  </dd>
                </div>
              </>
            )}

            <div>
              <dt className="text-gray-500">Payment Status</dt>
              <dd className="font-medium">
                <StatusBadge
                  text={payment?.payment_status ?? (loading ? "…" : "—")}
                  tone={
                    payment?.payment_status === "paid"
                      ? "ok"
                      : payment?.payment_status
                        ? "warn"
                        : "info"
                  }
                />
              </dd>
            </div>

            <div>
              <dt className="text-gray-500">Session Status</dt>
              <dd className="font-medium">
                <StatusBadge
                  text={payment?.status ?? (loading ? "…" : "—")}
                  tone={
                    payment?.status === "complete"
                      ? "ok"
                      : payment?.status
                        ? "info"
                        : "info"
                  }
                />
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-gray-500">Transaction</dt>
              <dd className="font-medium">
                {loading ? "…" : short(payment?.transaction_id)}
              </dd>
            </div>
          </dl>
          <aside className=" ">
            <h3 className="text-base font-semibold text-gray-900">Customer</h3>
            <small className="block mt-1 text-gray-500">Billing details</small>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm">
              <div>
                <dt className="text-gray-500">Name</dt>
                <dd className="font-medium">
                  {loading ? "…" : payment?.customer_details?.name || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="font-medium">
                  {loading ? "…" : payment?.customer_details?.email || "—"}
                </dd>
              </div>
            </dl>

            {/* BUTTON ROW (no flex) */}
            <div className="mt-2 grid grid-flow-col auto-cols-max gap-3 ">
              <a
                href="/dashboard/orders"
                className="inline-block rounded-lg bg-gray-900 text-white px-2 py-2 hover:bg-black transition"
              >
                View Orders
              </a>
              {payment?.receipt_url && (
                <a
                  href={payment.receipt_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-lg border border-gray-300 px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition"
                >
                  Download Receipt
                </a>
              )}
            </div>
          </aside>
        </article>
      </section>
    </main>
  );
}

function StatusBadge({
  text,
  tone,
}: {
  text: string;
  tone: "ok" | "warn" | "info" | "err";
}) {
  const classes = {
    ok: "bg-green-100 text-green-800",
    warn: "bg-yellow-100 text-yellow-800",
    info: "bg-gray-100 text-gray-800",
    err: "bg-red-100 text-red-800",
  }[tone];
  return (
    <span
      className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {text}
    </span>
  );
}
