import os
import shutil
import subprocess
import tempfile
import camoufox.pkgman as p

f = p.CamoufoxFetcher()
f.fetch_latest()

def download(file, url):
    if os.path.exists("camoufox.zip") and os.path.getsize("camoufox.zip") > 100 * 1024 * 1024:
        print("Using local camoufox.zip from build context...")
        with open("camoufox.zip", "rb") as src:
            shutil.copyfileobj(src, file)
    else:
        print(f"Downloading {url} with aria2c multi-connection...")
        with tempfile.TemporaryDirectory() as td:
            subprocess.run(
                ["aria2c", "-s", "16", "-x", "16", "-k", "1M", "-d", td, "-o", "cf.zip", url],
                check=True,
            )
            with open(os.path.join(td, "cf.zip"), "rb") as src:
                shutil.copyfileobj(src, file)
    file.seek(0)
    return file

f.download_file = download
print("Installing Camoufox browser...")
f.install()
print("Camoufox installation complete.")
