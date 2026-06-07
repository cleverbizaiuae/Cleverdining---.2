from django_filters.rest_framework import DjangoFilterBackend


class SchemaSafeDjangoFilterBackend(DjangoFilterBackend):
    """Django-filter backend with DRF OpenAPI compatibility.

    The installed django-filter backend does not expose
    get_schema_operation_parameters(), which makes `manage.py generateschema`
    crash. Runtime filtering behavior is inherited unchanged.
    """

    def get_schema_operation_parameters(self, view):
        return []
