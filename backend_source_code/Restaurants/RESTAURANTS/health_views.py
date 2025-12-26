from django.http import JsonResponse
from django.db import connection

def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            one = cursor.fetchone()[0]
            if one != 1:
                raise Exception("DB returned wrong value")
        return JsonResponse({"status": "ok", "db": "connected"}, status=200)
    except Exception as e:
        return JsonResponse({"status": "error", "db": str(e)}, status=500)
