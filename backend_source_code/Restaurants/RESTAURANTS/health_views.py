from django.http import JsonResponse
from django.db import connection

from django.conf import settings

def health_check(request):
    db_config = settings.DATABASES['default']
    debug_info = {
        "host": db_config.get('HOST', 'unknown'),
        "port": db_config.get('PORT', '5432'),
        "name": db_config.get('NAME', 'unknown'),
        "sslmode": db_config.get('OPTIONS', {}).get('sslmode', 'none'),
        "engine": db_config.get('ENGINE', 'unknown')
    }
    
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            one = cursor.fetchone()[0]
            if one != 1:
                raise Exception("DB returned wrong value")
        return JsonResponse({"status": "ok", "db": "connected", "config": debug_info}, status=200)
    except Exception as e:
        return JsonResponse({"status": "error", "db_error": str(e), "config": debug_info}, status=500)
