import { Link, useSearchParams } from "react-router-dom";

export default function CancelPage() {
  const [p] = useSearchParams();
  const orderId = p.get("order_id");

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-bold text-gray-900">Payment Cancelled</h1>
      <small className="block mt-1 text-gray-500">No charges were made.</small>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-900">Order</h2>
        <p className="mt-2 text-sm text-gray-700">
          {orderId ? (
            <>
              Order <strong>#{orderId}</strong> was not paid.
            </>
          ) : (
            "This checkout was canceled."
          )}
        </p>

        <div className="mt-5 grid grid-flow-col auto-cols-max gap-3">
          <Link
            to="/dashboard/orders"
            className="inline-block rounded-lg bg-gray-900 text-white px-4 py-2.5 hover:bg-black transition"
          >
            View Orders
          </Link>
          {/* {orderId && (
            <Link
              to={`/checkout/${orderId}`}
              className="inline-block rounded-lg border border-gray-300 px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition"
            >
              Try Again
            </Link>
          )} */}
        </div>
      </section>
    </main>
  );
}
