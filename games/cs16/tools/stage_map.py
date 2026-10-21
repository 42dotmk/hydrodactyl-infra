#!/usr/bin/env python3
"""Copy the playable parts of an extracted map archive into a cstrike-relative tree.

Community archives are laid out inconsistently (bsp at the root, under cstrike/maps/, inside a
named folder, plus screenshots). Keep only known resource types, normalise their paths, and
report which WADs each .bsp references so missing textures are caught at build time.

usage: stage_map.py <extracted-dir> <dest-cstrike-dir> [<dir-with-available-wads>...]
"""
import os, re, shutil, struct, sys

RESOURCE_DIRS = ("maps", "sound", "gfx", "models", "sprites", "overviews")
ALLOWED = (".bsp", ".nav", ".res", ".txt", ".wad", ".wav", ".mp3", ".tga", ".bmp", ".mdl", ".spr")

def target_path(rel):
    parts = rel.replace("\\", "/").split("/")
    name = parts[-1]
    low = name.lower()
    if not low.endswith(ALLOWED):
        return None
    if low.endswith(".wad"):
        return name
    if low.endswith(".bsp"):
        return "maps/" + name
    lowered = [p.lower() for p in parts]
    for d in RESOURCE_DIRS:
        if d in lowered[:-1]:
            return "/".join(parts[lowered.index(d):])
    return None  # loose readme/txt files outside resource dirs

def bsp_wads(path):
    with open(path, "rb") as f:
        data = f.read()
    version, off, length = struct.unpack("<iii", data[:12])
    if version != 30:
        sys.exit(f"{path}: BSP version {version}, expected 30 (GoldSrc)")
    m = re.search(r'"wad"\s+"([^"]*)"', data[off:off + length].decode("latin-1"))
    return [os.path.basename(w.replace("\\", "/")) for w in (m.group(1).split(";") if m else []) if w]

def main():
    src, dest, wad_dirs = sys.argv[1], sys.argv[2], sys.argv[3:]
    staged = []
    for root, _, files in os.walk(src):
        for name in files:
            rel = os.path.relpath(os.path.join(root, name), src)
            tgt = target_path(rel)
            if tgt:
                os.makedirs(os.path.dirname(os.path.join(dest, tgt)) or dest, exist_ok=True)
                shutil.copyfile(os.path.join(root, name), os.path.join(dest, tgt))
                staged.append(tgt)
    bsps = [t for t in staged if t.endswith(".bsp")]
    if not bsps:
        sys.exit(f"{src}: no .bsp found")
    available = {f.lower() for d in [dest] + wad_dirs if os.path.isdir(d) for f in os.listdir(d) if f.lower().endswith(".wad")}
    for b in bsps:
        missing = [w for w in bsp_wads(os.path.join(dest, b)) if w.lower() not in available]
        print(f"{b}: {len(staged)} files staged" + (f", MISSING WADS: {missing}" if missing else ", all WADs available"))
        if missing:
            sys.exit(1)

if __name__ == "__main__":
    main()
