import hashlib

from rest_framework.schemas.openapi import AutoSchema


class UniqueOperationIdAutoSchema(AutoSchema):
    """
    DRF builds operationIds from view/action names, so alias routes such as
    `/api/foo` and `/api/foo/` collide during `manage.py generateschema`.
    Add a short route hash to keep generated docs deterministic and unique
    without changing any public URL.
    """

    def get_operation_id(self, path, method):
        base_operation_id = super().get_operation_id(path, method)
        route_key = f"{method.upper()} {path}"
        digest = hashlib.sha1(route_key.encode("utf-8")).hexdigest()[:8]
        return f"{base_operation_id}_{digest}"
