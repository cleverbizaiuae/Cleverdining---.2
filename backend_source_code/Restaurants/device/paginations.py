from rest_framework.pagination import PageNumberPagination

class DevicePagination(PageNumberPagination):
    page_size = 10
    page_size_query_param ='page_size'



class ReservationPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param ='page_size'