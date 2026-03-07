import sqlite3
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
AGF_DB_PATH = ROOT_DIR / "database" / "agf_database.db"
CONNECTIVITY_DB_PATH = ROOT_DIR / "database" / "connectivity.db"
AGF_TABLES_TO_KEEP = {"users", "service_types", "service_prices", "platform_settings"}


def _get_user_tables(conn: sqlite3.Connection):
    cursor = conn.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    )
    return [row[0] for row in cursor.fetchall()]


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    cursor = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        (table_name,),
    )
    return cursor.fetchone() is not None


def clear_agf_database(db_path: Path):
    if not db_path.exists():
        print(f"[AGF] Skipped: database not found at {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("BEGIN")

        tables = _get_user_tables(conn)

        deleted_tables = []

        for table in tables:
            if table == "users":
                # Preserve admin login records.
                conn.execute(
                    "DELETE FROM users WHERE role != 'Admin' AND lower(email) != 'admin@gmail.com'"
                )
                print("[AGF] Cleared non-admin users")
            elif table in AGF_TABLES_TO_KEEP:
                print(f"[AGF] Kept table: {table}")
            else:
                conn.execute(f'DELETE FROM "{table}"')
                print(f"[AGF] Cleared table: {table}")
                deleted_tables.append(table)

        if _table_exists(conn, "sqlite_sequence"):
            # Reset sequences only for tables that were actually cleared.
            for table in deleted_tables:
                conn.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
            conn.execute(
                """
                UPDATE sqlite_sequence
                SET seq = COALESCE((SELECT MAX(id) FROM users), 0)
                WHERE name = 'users'
                """
            )

        conn.commit()
        print("[AGF] Cleanup committed")
    except Exception as exc:
        conn.rollback()
        raise RuntimeError(f"[AGF] Cleanup failed: {exc}") from exc
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.close()


def clear_connectivity_database(db_path: Path):
    if not db_path.exists():
        print(f"[CONNECTIVITY] Skipped: database not found at {db_path}")
        return

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        conn.execute("BEGIN")

        tables = _get_user_tables(conn)
        for table in tables:
            conn.execute(f'DELETE FROM "{table}"')
            print(f"[CONNECTIVITY] Cleared table: {table}")

        if _table_exists(conn, "sqlite_sequence"):
            conn.execute("DELETE FROM sqlite_sequence")

        conn.commit()
        print("[CONNECTIVITY] Cleanup committed")
    except Exception as exc:
        conn.rollback()
        raise RuntimeError(f"[CONNECTIVITY] Cleanup failed: {exc}") from exc
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.close()


def main():
    print("This will permanently clear both databases.")
    print("Admin rows in users table are preserved.")
    confirm = input("Type YES to continue: ").strip()
    if confirm != "YES":
        print("Cancelled.")
        return

    clear_agf_database(AGF_DB_PATH)
    clear_connectivity_database(CONNECTIVITY_DB_PATH)
    print("Done.")


if __name__ == "__main__":
    main()
