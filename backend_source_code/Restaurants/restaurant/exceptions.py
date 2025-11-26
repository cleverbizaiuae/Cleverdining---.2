from rest_framework.views import exception_handler
from rest_framework.response import Response
import logging

logger = logging.getLogger(__name__)

def custom_exception_handler(exc, context):
    """
    Custom exception handler to ensure all errors return JSON.
    Catches EVERYTHING and returns proper JSON.
    """
    try:
        # Call REST framework's default exception handler first
        response = exception_handler(exc, context)
        
        # If response is None, it means an unhandled exception occurred
        if response is None:
            logger.error(f"Unhandled exception: {exc}", exc_info=True)
            try:
                error_detail = str(exc)
            except:
                error_detail = "Unknown error"
            
            response = Response(
                {
                    "error": "An unexpected error occurred",
                    "detail": error_detail,
                    "message": "Please try again or contact support if the problem persists."
                },
                status=500
            )
        else:
            # Ensure response data is always a dict
            try:
                if not isinstance(response.data, dict):
                    response.data = {"detail": str(response.data)}
            except:
                response.data = {"detail": "An error occurred"}
        
        return response
    except Exception as handler_error:
        # Even the exception handler can fail - return absolute minimum JSON
        logger.error(f"Exception handler itself failed: {str(handler_error)}", exc_info=True)
        return Response(
            {
                "error": "Server error",
                "detail": "An unexpected error occurred",
                "message": "Please try again later."
            },
            status=500
        )

