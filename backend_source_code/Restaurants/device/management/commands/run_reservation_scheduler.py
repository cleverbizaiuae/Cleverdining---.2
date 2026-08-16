import time
import logging

from django.core.management.base import BaseCommand

from .process_reservations import process_reservations

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Run reservation processing every 15 minutes.'

    def handle(self, *args, **options):
        self.stdout.write('Reservation scheduler started (15-minute interval).')
        while True:
            try:
                counts = process_reservations()
                self.stdout.write('Reservation processing complete: ' + str(counts))
            except Exception:
                logger.exception('Reservation processing failed; retrying in 15 minutes')
            time.sleep(900)
