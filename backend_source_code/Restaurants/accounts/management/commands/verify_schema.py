from __future__ import annotations

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


INTEGER_TYPES = {
    "AutoField",
    "BigAutoField",
    "BigIntegerField",
    "IntegerField",
    "PositiveBigIntegerField",
    "PositiveIntegerField",
    "PositiveSmallIntegerField",
    "SmallIntegerField",
}
TEXT_TYPES = {
    "CharField",
    "EmailField",
    "FileField",
    "ImageField",
    "SlugField",
    "TextField",
    "URLField",
    "UUIDField",
}
DATE_TYPES = {"DateField", "DateTimeField", "TimeField"}
DECIMAL_TYPES = {"DecimalField", "FloatField"}
BOOLEAN_TYPES = {"BooleanField", "NullBooleanField"}


def _type_family(internal_type: str) -> str:
    if internal_type in INTEGER_TYPES:
        return "integer"
    if internal_type in TEXT_TYPES:
        return "text"
    if internal_type == "JSONField":
        # SQLite introspects JSONField as TextField. Treat it as compatible.
        return "text"
    if internal_type in DATE_TYPES:
        return "date"
    if internal_type in DECIMAL_TYPES:
        return "decimal"
    if internal_type in BOOLEAN_TYPES:
        return "boolean"
    if internal_type == "BinaryField":
        return "binary"
    return internal_type


def _expected_internal_type(field) -> str:
    if getattr(field, "remote_field", None) and getattr(field, "target_field", None):
        return field.target_field.get_internal_type()
    return field.get_internal_type()


class Command(BaseCommand):
    help = "Compare Django model tables/columns against the active database schema."

    def add_arguments(self, parser):
        parser.add_argument(
            "--app",
            action="append",
            dest="apps",
            help="Limit verification to one app label. Can be provided multiple times.",
        )
        parser.add_argument(
            "--skip-type-check",
            action="store_true",
            help="Only verify migrations, tables, and columns.",
        )

    def handle(self, *args, **options):
        selected_apps = set(options.get("apps") or [])
        skip_type_check = options["skip_type_check"]
        issues: list[str] = []
        warnings: list[str] = []
        checked_models = 0
        matching_models = 0

        self.stdout.write("=== Schema Verification ===")

        pending_migrations = self._pending_migrations()
        if pending_migrations:
            for app_label, migration_name in pending_migrations:
                issues.append(f"Missing Migration: {app_label}.{migration_name}")
                self.stdout.write(
                    self.style.ERROR(f"FAIL Missing Migration: {app_label}.{migration_name}")
                )
        else:
            self.stdout.write(self.style.SUCCESS("OK Migrations: all applied"))

        with connection.cursor() as cursor:
            table_names = set(connection.introspection.table_names(cursor))

        for model in apps.get_models(include_auto_created=False):
            meta = model._meta
            if selected_apps and meta.app_label not in selected_apps:
                continue
            if meta.proxy or not meta.managed:
                continue

            checked_models += 1
            label = f"{meta.app_label}.{meta.object_name}"
            table = meta.db_table
            if table not in table_names:
                issues.append(f"Missing Table: {table} ({label})")
                self.stdout.write(self.style.ERROR(f"FAIL Missing Table: {table} ({label})"))
                continue

            table_issues, table_warnings = self._verify_model_table(
                model,
                skip_type_check=skip_type_check,
            )
            issues.extend(table_issues)
            warnings.extend(table_warnings)

            if table_issues:
                for issue in table_issues:
                    self.stdout.write(self.style.ERROR(f"FAIL {issue}"))
            else:
                matching_models += 1
                self.stdout.write(self.style.SUCCESS(f"OK Matching: {label} ({table})"))

            for warning in table_warnings:
                self.stdout.write(self.style.WARNING(f"WARN {warning}"))

        self.stdout.write("")
        self.stdout.write(
            f"Checked {checked_models} managed models; {matching_models} have required tables/columns."
        )
        if warnings:
            self.stdout.write(self.style.WARNING(f"Warnings: {len(warnings)}"))
        if issues:
            self.stdout.write(self.style.ERROR(f"Schema verification failed: {len(issues)} issue(s)."))
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS("Schema verification passed."))

    def _pending_migrations(self) -> list[tuple[str, str]]:
        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        plan = executor.migration_plan(targets)
        return [(migration.app_label, migration.name) for migration, backwards in plan if not backwards]

    def _verify_model_table(self, model, *, skip_type_check: bool) -> tuple[list[str], list[str]]:
        issues: list[str] = []
        warnings: list[str] = []
        meta = model._meta
        table = meta.db_table

        with connection.cursor() as cursor:
            description = connection.introspection.get_table_description(cursor, table)
            constraints = connection.introspection.get_constraints(cursor, table)

        columns = {column.name: column for column in description}

        for field in meta.concrete_fields:
            column_name = field.column
            if column_name not in columns:
                issues.append(f"Missing Column: {table}.{column_name} ({meta.label}.{field.name})")
                continue

            column = columns[column_name]
            if not skip_type_check:
                actual_type = connection.introspection.get_field_type(column.type_code, column)
                expected_type = _expected_internal_type(field)
                if _type_family(actual_type) != _type_family(expected_type):
                    issues.append(
                        f"Type Mismatch: {table}.{column_name} expected {expected_type}, got {actual_type}"
                    )

            null_ok = getattr(column, "null_ok", None)
            if null_ok is not None and not field.primary_key and not field.has_default():
                if bool(null_ok) != bool(field.null):
                    warnings.append(
                        f"Nullability Mismatch: {table}.{column_name} expected null={field.null}, got null_ok={null_ok}"
                    )

            if field.unique and not field.primary_key:
                has_unique = any(
                    column_name in info.get("columns", []) and info.get("unique")
                    for info in constraints.values()
                )
                if not has_unique:
                    warnings.append(f"Missing Unique Constraint: {table}.{column_name}")

        unique_sets = self._declared_unique_sets(meta)
        if unique_sets:
            indexed_uniques = {
                tuple(info.get("columns", []))
                for info in constraints.values()
                if info.get("unique")
            }
            for unique_set in unique_sets:
                if tuple(unique_set) not in indexed_uniques:
                    warnings.append(f"Missing Unique Constraint: {table}({', '.join(unique_set)})")

        return issues, warnings

    def _declared_unique_sets(self, meta) -> list[list[str]]:
        unique_sets: list[list[str]] = []
        for unique_together in meta.unique_together:
            unique_sets.append([meta.get_field(field_name).column for field_name in unique_together])
        for constraint in meta.constraints:
            fields = getattr(constraint, "fields", None)
            if fields:
                unique_sets.append([meta.get_field(field_name).column for field_name in fields])
        return unique_sets
