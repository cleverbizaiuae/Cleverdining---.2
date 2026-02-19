STATUS =(
    ('pending', 'Pending'),
    ('preparing', 'Preparing'),
    ('served', 'Served'),
    ('delivered', 'Delivered'), # Added Delivered
    ('paid', 'Paid'),
    ('awaiting_cash', 'Awaiting Cash'), # New status
    ('cancelled', 'Cancelled'),
    ('completed', 'Completed'),
)


PAYMENT_STATUS = [
    ('unpaid', 'Unpaid'),
    ('pending_cash', 'Pending Cash'), # New status
    ('paid', 'Paid'),
]