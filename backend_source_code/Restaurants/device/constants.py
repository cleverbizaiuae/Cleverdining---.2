ACTION_CHOICES = [
        ('active', 'Active'),
        ('hold', 'Hold'),
]


STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('overdue', 'Overdue'),
        ('seated', 'Seated'),
        ('extended', 'Extended'),
        ('finished', 'Finished'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
        # Legacy values kept for existing rows and older clients.
        ('accept', 'Accepted'),
        ('hold', 'Hold'),
        ('cancel', 'Cancelled'),
]

SOURCE_CHOICES = [
        ('dashboard', 'Dashboard'),
        ('whatsapp', 'WhatsApp'),
        ('phone', 'Phone'),
        ('web', 'Web'),
        ('walk_in', 'Walk-in'),
        ('google', 'Google'),
]
