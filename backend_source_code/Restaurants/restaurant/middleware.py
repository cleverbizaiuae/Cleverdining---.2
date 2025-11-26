import logging
import json
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)

class JSONExceptionMiddleware(MiddlewareMixin):
    """
    Middleware to ensure ALL exceptions return JSON responses.
    This catches exceptions that happen before DRF's exception handler.
    """
    def process_exception(self, request, exception):
        # ABSOLUTE CATCH-ALL: Convert ANY exception to JSON for API endpoints
        if (request.path.startswith('/api/') or
            request.path.startswith('/owners/') or
            '/register' in request.path or
            '/login' in request.path):

            # Check if it's an authentication error - return 401, not 500
            from rest_framework.exceptions import AuthenticationFailed, ValidationError, PermissionDenied
            if isinstance(exception, (AuthenticationFailed, ValidationError, PermissionDenied)):
                logger.warning(f"Authentication error in {request.path}: {str(exception)}")
                error_detail = str(exception.detail) if hasattr(exception, 'detail') else str(exception)
                if isinstance(error_detail, list):
                    error_detail = error_detail[0] if error_detail else "Authentication failed"
                return JsonResponse(
                    {
                        "detail": error_detail,
                        "error": "Authentication failed"
                    },
                    status=401
                )

            # For other exceptions, log and return 500
            logger.error(f"CRITICAL: Exception in {request.path}: {str(exception)}", exc_info=True)
            return JsonResponse(
                {
                    "error": "Server error",
                    "detail": "An unexpected error occurred",
                    "message": "Please try again later."
                },
                status=500
            )

        # Let admin/static/media be handled normally (they might return HTML)
        if request.path.startswith('/admin/') or request.path.startswith('/static/') or request.path.startswith('/media/'):
            return None

        # For other endpoints, still return JSON
        logger.error(f"Exception in {request.path}: {str(exception)}", exc_info=True)
        return JsonResponse(
            {
                "error": "An unexpected error occurred",
                "detail": str(exception),
                "message": "Please try again or contact support."
            },
            status=500
        )

    def process_response(self, request, response):
        """
        Intercept responses and convert HTML errors to JSON for API endpoints
        """
        # Check if this is an API endpoint that returned an HTML error
        if (request.path.startswith('/api/') or
            request.path.startswith('/owners/') or
            '/register' in request.path or
            '/login' in request.path):

            # If response is HTML and status is error (400-599), convert to JSON
            if (hasattr(response, 'get') and
                response.get('Content-Type', '').startswith('text/html') and
                response.status_code >= 400):

                logger.error(f"Converting HTML error response to JSON for {request.path} (status: {response.status_code})")
                return JsonResponse(
                    {
                        "error": "Server error",
                        "detail": f"HTTP {response.status_code}",
                        "message": "Please try again later."
                    },
                    status=response.status_code
                )

        return response
