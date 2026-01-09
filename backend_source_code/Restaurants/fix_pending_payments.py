"""
One-time script to fix pending payment statuses.
Run on Render Shell: python manage.py shell < fix_pending_payments.py
"""

from payment.models import Payment
from django.utils import timezone

print("=== Fixing Pending Payment Statuses ===")

# Find all payments with status 'pending' where the order is paid
pending_payments = Payment.objects.filter(status='pending')
count = pending_payments.count()
print(f"Found {count} pending payments")

updated = 0
for payment in pending_payments:
    # Check if the order is paid
    if payment.order and payment.order.payment_status == 'paid':
        payment.status = 'completed'
        payment.confirmed_at = timezone.now()
        payment.save()
        updated += 1
        print(f"  ✓ Payment #{payment.id} (Order #{payment.order.id}) -> completed")
    # Also mark payments for awaiting_cash orders as they've been collected
    elif payment.order and payment.order.status in ['paid', 'completed']:
        payment.status = 'completed'
        payment.confirmed_at = timezone.now()
        payment.save()
        updated += 1
        print(f"  ✓ Payment #{payment.id} (Order #{payment.order.id}, status={payment.order.status}) -> completed")

print(f"\n=== Updated {updated} payments to 'completed' ===")
