"""Print every Django route as JSON: full regex, accepted methods and view name."""
import json
import os
import sys

sys.path.insert(0, os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "RESTAURANTS.settings")
import django  # noqa: E402

django.setup()
from django.urls import URLPattern, URLResolver, get_resolver  # noqa: E402

HTTP = ["get", "post", "put", "patch", "delete"]


def methods_for(callback):
    actions = getattr(callback, "actions", None)
    if actions:
        return sorted(m.upper() for m in actions)
    cls = getattr(callback, "view_class", None) or getattr(callback, "cls", None)
    if cls is not None:
        return sorted(m.upper() for m in HTTP if hasattr(cls, m))
    initkwargs = getattr(callback, "initkwargs", None)
    return ["ANY"]


def pattern_regex(p):
    regex = p.pattern.regex.pattern
    return regex[1:] if regex.startswith("^") else regex


def walk(patterns, prefix=""):
    for p in patterns:
        regex = prefix + pattern_regex(p).rstrip("$").replace("\\Z", "")
        if isinstance(p, URLResolver):
            yield from walk(p.url_patterns, regex)
        elif isinstance(p, URLPattern):
            cb = p.callback
            name = getattr(cb, "__name__", str(cb))
            cls = getattr(cb, "view_class", None) or getattr(cb, "cls", None)
            if cls is not None:
                name = f"{cls.__module__}.{cls.__name__}"
            yield {"regex": "^" + regex + "$", "methods": methods_for(cb), "view": name}


routes = list(walk(get_resolver().url_patterns))
json.dump(routes, sys.stdout, indent=1)
print(f"\n# {len(routes)} routes", file=sys.stderr)
