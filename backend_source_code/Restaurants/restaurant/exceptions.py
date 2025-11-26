from rest_framework.views import exception_handler
from rest_framework.response import Response
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    """
    Custom exception handler to ensure all errors return JSON.
    """
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)
    
    # If response is None, it means an unhandled exception occurred
    if response is None:
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        response = Response(
            {
                "error": "An unexpected error occurred",
                "detail": str(exc),
                "message": "Please try again or contact support if the problem persists."
            },
            status=500
        )
    else:
        # Ensure response data is always a dict
        if not isinstance(response.data, dict):
            response.data = {"detail": str(response.data)}
    
    return response

