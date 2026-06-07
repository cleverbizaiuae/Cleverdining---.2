from django.conf import settings
from django.views.static import serve


def cached_media_serve(request, path, document_root=None, show_indexes=False):
    response = serve(
        request,
        path,
        document_root=document_root or settings.MEDIA_ROOT,
        show_indexes=show_indexes,
    )
    response["Cache-Control"] = "public, max-age=2592000, immutable"
    return response
