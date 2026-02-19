import subprocess
import sys
import os


def build():
    # Define PyInstaller arguments
    args = [
        "pyinstaller",
        "main.py",
        "--name",
        "Issuer",
        "--icon",
        "app.ico",
        "--add-data",
        "app.ico;.",
        "--clean",
        "--onefile",  # Generate a single executable
        "--collect-all",
        "flet_desktop",  # Bundle Flet desktop runtime
    ]

    # CI環境（GitHub Actions等）でない場合のみ、--noconsole を追加する
    if not os.environ.get("CI"):
        args.append("--noconsole")

    # Run PyInstaller
    print(f"Running: {' '.join(args)}")
    result = subprocess.run(args)

    if result.returncode == 0:
        print("\nBuild successful! Executable is in the 'dist' folder.")
    else:
        print("\nBuild failed.")
        sys.exit(result.returncode)


if __name__ == "__main__":
    build()
