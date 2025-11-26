import logging
import json
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

class JSONExceptionMiddleware(MiddlewareMixin):
    """
    Middleware to ensure all exceptions return JSON responses for API endpoints.
    This catches exceptions that happen before DRF's exception handler.
    """
    def process_exception(self, request, exception):
        # EXCLUDE admin panel and static files - let Django handle those normally
        if request.path.startswith('/admin/') or request.path.startswith('/static/') or request.path.startswith('/media/'):
            return None  # Let Django handle admin/static/media normally
        
        # Only handle API endpoints
        if request.path.startswith('/owners/') or request.path.startswith('/api/') or '/register' in request.path or '/login' in request.path:
            logger.error(f"Unhandled exception in {request.path}: {str(exception)}", exc_info=True)
            return JsonResponse(
                {
                    "error": "An unexpected error occurred",
                    "detail": str(exception),
                    "message": "Please try again or contact support."
                },
                status=500
            )
        # Let other exceptions be handled normally
        return None
