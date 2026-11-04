"""Builds the locally stored demo reference PHOTOS from a reviewed selection of openly licensed images.

Inputs
  picks.json      : {"NN": {"front": "<candidate id>", "detail": "<candidate id>"?, "crop": [cx, cy]?}, ...}
                    (only products with a visually verified, matching photo are listed)
  candidates.json : candidate metadata recorded at discovery time from the Wikimedia Commons API / Openverse API:
                    download URL, source page, author, licence, licence URL.
Checks
  * licence must be CC0, Public Domain / PDM, CC BY or CC BY-SA (NC / ND are rejected);
  * for Openverse results hosted on Flickr, the licence is verified again on the original Flickr page.
Output
  public/images/demo/products/photos/item-NN-{front|detail}.webp : 800 x 600 WebP (q 80), metadata (EXIF/GPS) not copied.
    Landscape photos are cover-cropped to 4:3; portrait / square photos are placed whole on a blurred, enlarged copy
    of themselves (no distortion, nothing of the product cut off).
  src/data/demoProductPhotos.json       : manifest used by the UI (photo + attribution line)
  public/images/demo/products/photos/CREDITS.md : source, author, licence and changes for every file

Usage: python process-demo-photos.py <picks.json> <candidates.json>      (requires Pillow)
"""
import json, os, re, sys, urllib.request
from io import BytesIO
from PIL import Image, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "images", "demo", "products", "photos")
MANIFEST = os.path.join(ROOT, "src", "data", "demoProductPhotos.json")
UA = "UniMarketDemoAssets/1.0 (student project; https://github.com/Minus-ngcsonnn/UniMarket)"
ALLOWED = re.compile(r"^(cc0( 1\.0)?|public domain|pdm|cc by(-sa)? ?\d\.\d)$", re.I)
W, H = 800, 600


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r:
        return r.read()


def verify_flickr(cand):
    """Re-checks the licence on the original Flickr page (Openverse is only an index)."""
    page = fetch(cand["page"]).decode("utf-8", "replace")
    m = re.search(r"creativecommons\.org/(licenses|publicdomain)/([a-z-]+)/(\d\.\d)", page)
    if not m:
        raise SystemExit(f"{cand['id']}: no CC licence found on {cand['page']}")
    found = f"{m.group(2)} {m.group(3)}".lower()
    if cand["license"].upper() in ("CC0", "PDM"):
        ok = m.group(2) in ("zero", "mark")
    else:
        ok = found == cand["license"].lower().replace("cc ", "")
    if not ok:
        raise SystemExit(f"{cand['id']}: licence on Flickr page ({found}) differs from index ({cand['license']})")


def render(img, center):
    img = ImageOps.exif_transpose(img).convert("RGB")
    w, h = img.size
    if w / h >= 1.15:  # landscape: cover-crop to 4:3 around the chosen centre
        nw, nh = (int(h * W / H), h) if w / h > W / H else (w, int(w * H / W))
        cx, cy = center
        left = min(max(int(cx * w - nw / 2), 0), w - nw)
        top = min(max(int(cy * h - nh / 2), 0), h - nh)
        return img.crop((left, top, left + nw, top + nh)).resize((W, H), Image.LANCZOS), "resized and cropped to 4:3"
    # portrait / square: whole photo on a blurred backdrop made from the same photo
    back = ImageOps.fit(img, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(28))
    back = Image.blend(back, Image.new("RGB", (W, H), (245, 245, 245)), 0.35)
    fg = img.copy()
    fg.thumbnail((W, H - 24), Image.LANCZOS)
    back.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
    return back, "resized and placed on a blurred backdrop made from the same photo (4:3)"


def clean(s):
    return s.replace("|", "/").replace("\n", " ")


def main():
    picks = json.load(open(sys.argv[1], encoding="utf-8"))
    cands = json.load(open(sys.argv[2], encoding="utf-8"))
    by_id = {c["id"]: c for group in cands.values() for c in group}
    os.makedirs(OUT, exist_ok=True)
    manifest, credits = {}, []
    for n in sorted(picks, key=int):
        for variant in ("front", "detail"):
            cid = picks[n].get(variant)
            if not cid:
                continue
            cand = by_id[cid]
            if not ALLOWED.match(cand["license"].strip()):
                raise SystemExit(f"{n} {variant}: licence not allowed: {cand['license']}")
            if "flickr.com" in (cand.get("page") or ""):
                verify_flickr(cand)
            img, change = render(Image.open(BytesIO(fetch(cand["download"]))), tuple(picks[n].get("crop", (0.5, 0.5))))
            name = f"item-{int(n):02d}-{variant}.webp"
            img.save(os.path.join(OUT, name), "WEBP", quality=80, method=6)  # no exif=: metadata is dropped
            src = "Flickr" if "flickr.com" in (cand.get("page") or "") else "Wikimedia Commons"
            entry = {"file": name, "title": (cand.get("title") or "").replace("File:", ""), "creator": cand["creator"],
                     "sourceUrl": cand["page"], "sourceName": src, "license": cand["license"],
                     "licenseUrl": cand.get("license_url") or "", "modified": True, "change": change, "candidate": cid}
            manifest.setdefault(f"{int(n):02d}", {})[variant] = entry
            credits.append((name, entry))
            print(name, os.path.getsize(os.path.join(OUT, name)) // 1024, "KB", cand["license"], cid, flush=True)
    json.dump(manifest, open(MANIFEST, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "CREDITS.md"), "w", encoding="utf-8") as f:
        f.write("# Demo reference photos: sources and licences\n\n"
                "Openly licensed REFERENCE photos of the product shown in each seeded demo listing (V001). They are not photos of\n"
                "the actual second-hand items and are labelled \"Ảnh tham khảo\" in the UI. Licences were read from the Wikimedia\n"
                "Commons file page or, for Flickr, re-checked on the original Flickr page. Listings without a verified, matching\n"
                "photo have no image here and show the neutral placeholder.\n\n"
                "| File | Original title | Author | Source | Licence | Changes |\n|---|---|---|---|---|---|\n")
        for name, e in credits:
            lic = f"[{e['license']}]({e['licenseUrl']})" if e["licenseUrl"] else e["license"]
            f.write(f"| {name} | {clean(e['title'])} | {clean(e['creator'])} | [{e['sourceName']}]({e['sourceUrl']}) | {lic} | {e['change']}; WebP |\n")
    print(f"{len(credits)} photos for {len(manifest)} products")


if __name__ == "__main__":
    main()
