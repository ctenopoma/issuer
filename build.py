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
        "--noconsole",
        "--clean",
        "--onefile",  # Generate a single executable
    ]

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
