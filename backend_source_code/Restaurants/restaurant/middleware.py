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
        """
        BULLETPROOF EXCEPTION HANDLER - Catches ALL exceptions
        """
        # Check if this is an authentication/API endpoint
        is_auth_endpoint = '/login' in request.path or '/register' in request.path
        is_api_endpoint = (
            request.path.startswith('/api/') or
            request.path.startswith('/owners/') or
            request.path.startswith('/accounts/') or
            is_auth_endpoint
        )
        
        if is_api_endpoint:
            # Check if it's an authentication error
            from rest_framework.exceptions import AuthenticationFailed, ValidationError, PermissionDenied, NotAuthenticated
            if isinstance(exception, (AuthenticationFailed, ValidationError, PermissionDenied, NotAuthenticated)):
                logger.warning(f"Auth/validation error in {request.path}: {str(exception)}")
                error_detail = str(exception.detail) if hasattr(exception, 'detail') else str(exception)
                if isinstance(error_detail, list):
                    error_detail = error_detail[0] if error_detail else "Authentication failed"
                return JsonResponse(
                    {
                        "detail": error_detail,
                        "error": "authentication_failed"
                    },
                    status=401
                )
            
            # CRITICAL: For login/register endpoints, NEVER return 500
            # Login returns 401, registration returns 400
            if is_auth_endpoint:
                logger.error(f"ERROR in auth endpoint {request.path}: {str(exception)}", exc_info=True)
                import traceback
                logger.error(f"Traceback: {traceback.format_exc()}")
                
                # Registration endpoints should return 400, login returns 401
                if '/register' in request.path:
                    return JsonResponse(
                        {
                            "detail": "Registration failed. Please check your input and try again.",
                            "error": "registration_error"
                        },
                        status=400  # Return 400 for registration errors
                    )
                else:
                    return JsonResponse(
                        {
                            "detail": "Authentication failed. Please check your credentials and try again.",
                            "error": "authentication_error"
                        },
                        status=401  # Return 401 for login errors
                    )
            
            # For other API exceptions, log and return 500
            logger.error(f"CRITICAL: Exception in {request.path}: {str(exception)}", exc_info=True)
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            
            return JsonResponse(
                {
                    "error": "server_error",
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
