from item.bootstrap import ensure_pranay_production_menu


class ProductionMenuBootstrapMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ensure_pranay_production_menu()
        return self.get_response(request)

