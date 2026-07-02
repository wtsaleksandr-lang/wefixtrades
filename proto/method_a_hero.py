# Method A (hero base): perspective-warp a seamless upscaled architectural-shingle tile onto each
# roof-plane quad of the NEW elevated 3/4 hero base, modulate by the AI render's smoothed luminance,
# composite through a strict binary mask (outsideMax=0). Weathered-wood tone.
#
# Reuses proto/arch_tile_joints.png (already Real-ESRGAN-upscaled seamless tile from refs/architectural.png).
# Quads re-derived for the new base (scripts/showroom-assets/base.png, 1216x832, hipbig-0 hero angle).
#
# Run: python proto/method_a_hero.py   (from worktree root)
import cv2, numpy as np, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "scripts/showroom-assets/base.png")
TILE = os.path.join(ROOT, "proto/arch_tile_joints.png")
OUTDIR = os.path.join(ROOT, "proto")

base = cv2.imread(BASE).astype(np.float32)
H, W = base.shape[:2]
tile = cv2.imread(TILE).astype(np.float32)
tH, tW = tile.shape[:2]

# ---- Roof-plane quads for the NEW hero base (clockwise from top-left), re-derived visually. ----
# reps_x = how many tile-widths span the plane's top edge (controls shingle scale/course count);
# courses = vertical course count (controls tile vertical repeats). Larger plane => more reps.
PLANES = [
    # (quad, reps_x, courses) — reps_x LOW so each shingle tab spans many pixels (distinct at zoom)
    ([(280,315),(450,232),(735,258),(690,350)], 0.72, 4),   # main front hip slope (the star)
    ([(735,258),(690,350),(815,352),(905,298)], 0.38, 3),   # right hip return
    ([(205,340),(280,315),(300,352),(235,368)], 0.22, 2),   # left hip return
    ([(820,352),(905,300),(1000,352),(915,368)], 0.32, 3),  # garage gable slope
]

def tiled_source(dw, dh, reps_x):
    s = (dw / reps_x) / tW
    th = max(1, int(round(tH * s))); tw = max(1, int(round(tW * s)))
    ts = cv2.resize(tile, (tw, th), interpolation=cv2.INTER_AREA)
    return np.tile(ts, (int(np.ceil(dh/th)), int(np.ceil(dw/tw)), 1))[:dh, :dw]

def map_plane(quad, reps_x, courses):
    q = np.array(quad, np.float32)
    sw = int(max(np.linalg.norm(q[1]-q[0]), np.linalg.norm(q[2]-q[3]), 4))
    sh = int(max(4, sw / reps_x * (tH/tW) * courses))
    src = tiled_source(sw, sh, reps_x)
    Hm = cv2.getPerspectiveTransform(np.array([[0,0],[sw,0],[sw,sh],[0,sh]], np.float32), q)
    w = cv2.warpPerspective(src, Hm, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    pm = np.zeros((H, W), np.uint8); cv2.fillConvexPoly(pm, q.astype(np.int32), 1)
    return w, pm

shingle = np.zeros_like(base); cov = np.zeros((H, W), np.float32)
maskbin = np.zeros((H, W), np.uint8)
for quad, reps, courses in PLANES:
    w, pm = map_plane(quad, reps, courses)
    f = pm.astype(np.float32)
    shingle = shingle*(1-f[...,None]) + w*f[...,None]
    cov = np.maximum(cov, f)
    maskbin = np.maximum(maskbin, pm)

# Write the polygon-union mask + overlay (this IS the roof mask for the new base).
cv2.imwrite(os.path.join(ROOT, "scripts/showroom-assets/mask.png"), (maskbin*255).astype(np.uint8))
ov = base.copy(); ov[maskbin>0] = ov[maskbin>0]*0.35 + np.array([30,30,255],np.float32)*0.65
cv2.imwrite(os.path.join(ROOT, "scripts/showroom-assets/mask-overlay.png"), np.clip(ov,0,255).astype(np.uint8))

# ---- GENTLE lighting: multiply by BROAD (smoothed) luminance ratio only -> keep AI shading, no streaks
alum = cv2.cvtColor(np.clip(base,0,255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
alum_s = cv2.GaussianBlur(alum, (0,0), 8)
rm = alum_s[maskbin>0].mean()
lum = np.clip(alum_s/(rm+1e-6), 0.55, 1.5)
sl = shingle * lum[...,None]

# Weathered-wood tone: normalize the shingle to a controlled weathered-wood CHARCOAL target
# (warm gray-brown, medium-dark) — NOT the base's blue-tinted mean (that washed it out light).
sm = sl[maskbin>0].mean(0)                       # current BGR mean of textured shingle
TARGET_WW = np.array([96, 104, 110], np.float32)  # B,G,R weathered-wood charcoal (warm, medium-dark)
sl = sl * (TARGET_WW/(sm+1e-6))

# tiny broad-color nudge for valley/ridge shading transfer from the AI base (small, keeps tabs crisp):
ab = cv2.GaussianBlur(base, (0,0), 20); sb = cv2.GaussianBlur(sl, (0,0), 20)
sf = sl + (ab - sb) * 0.15

m3 = (maskbin>0)[...,None]
res = np.where(m3, np.clip(sf,0,255), base)
print("outsideMax:", float(np.abs((res-base)[maskbin==0]).max()))

cv2.imwrite(os.path.join(OUTDIR, "methodA_hero.jpg"), res.astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 95])

# 4x NEAREST zoom crop of the MAIN plane center to inspect shingle tabs at 100%.
cx0, cy0, cx1, cy1 = 400, 250, 700, 345
crop = res[cy0:cy1, cx0:cx1].astype(np.uint8)
zoom = cv2.resize(crop, (crop.shape[1]*4, crop.shape[0]*4), interpolation=cv2.INTER_NEAREST)
cv2.imwrite(os.path.join(OUTDIR, "methodA_hero_zoom.png"), zoom)
print("done; zoom crop", crop.shape, "->", zoom.shape)
