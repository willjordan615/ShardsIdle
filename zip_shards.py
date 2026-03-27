import zipfile
import os
from pathlib import Path

SOURCE_DIR = Path(__file__).parent  # same folder as this script
OUTPUT_ZIP = SOURCE_DIR / "ShardsIdle_clean.zip"

EXCLUDES = {
    "backend/node_modules",
    "backend/data/game.db",
}

def should_exclude(rel_path: str) -> bool:
    rel_path = rel_path.replace("\\", "/")
    for pattern in EXCLUDES:
        if rel_path.startswith(pattern):
            return True
    return False

def main():
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zf:
        for file in SOURCE_DIR.rglob("*"):
            if not file.is_file():
                continue
            rel = file.relative_to(SOURCE_DIR)
            rel_str = str(rel).replace("\\", "/")
            if should_exclude(rel_str):
                continue
            if rel_str == OUTPUT_ZIP.name:
                continue
            zf.write(file, rel_str)
            print(f"  + {rel_str}")

    print(f"\nDone: {OUTPUT_ZIP}")

if __name__ == "__main__":
    main()
